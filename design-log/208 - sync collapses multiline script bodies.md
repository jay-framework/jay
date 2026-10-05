# DL#208 — `sync` collapses multi-line script bodies (YAML corruption)

Status: **BUG — root-caused, fix proposed, not implemented.**

## Decisions for the Implementer (TL;DR)

- **Symptom:** `jay-stack sync` rewrites a page and collapses the **multi-line body** of
  `<script type="application/jay-headless">` (and other YAML script bodies) onto a single line
  (newlines → spaces), corrupting whitespace-significant YAML. Multi-**key** blocks break; single-key
  one-liners survive, so it's easy to miss.
- **Root cause (not in sync):** `prettifyHtml` flattens the whole document to one line in its
  line-join loop (`compiler-shared/lib/prettify.ts:54-63`). It protects **only**
  `application/jay-data` bodies (`JAY_DATA_SCRIPT` regex, `prettify.ts:32-33`), swapping them to
  placeholders before the join and restoring them verbatim after (`:42-45, 70-73`). ✅ verified
- **Why `sync` triggers it:** `syncPageContent` writes `prettifyHtml(merged)` to disk
  (`run-sync.ts:72`, written `:288`). `materialise` and `mergeScopeCss` round-trip through
  node-html-parser `root.toString()`, which **preserves** script raw text — so newlines are intact
  right up until `prettifyHtml` runs. `prettifyHtml` is the single collapse point. ✅ verified
- **Why the normal build is unaffected:** the compile path only _reads_ YAML bodies into memory
  (`headlessProps`, `validationOverrides`) and never writes the `.jay-html` source back, so it never
  runs the collapse on source. The bug is specific to the `sync` rewrite serializer. ✅ verified
  (parser is read-only) / ⚠️ assumed (no other jay-html source writeback exists).
- **Fix:** extend the verbatim-placeholder protection in `prettify.ts` from `application/jay-data`
  **only** to the whole significant-whitespace family: `application/jay-headless`,
  `application/jay-params`, `application/jay-validations`, and `application/yaml`. One regex + the
  existing swap/restore mechanism already present at `prettify.ts:32-45, 70-73`.
- **Two failure modes, one cause:** headless/params bodies fail **loudly** (`validate`: "bad
  indentation of a mapping entry (1:35)"); `jay-validations` fails **silently** —
  `parseValidationOverrides` swallows the YAML error in a `catch { return undefined }`
  (`jay-html-parser.ts:1065-1077`), so a nested suppression (e.g. `no-lcp-image: false`) just
  vanishes and the warning quietly reappears. ✅ verified

## Observed failing cases

1. **Multi-key headless props** (`type="application/jay-headless" key="templates"`):

   ```html
   <!-- before: valid -->                <!-- after sync: broken, one line -->
   <script ... key="templates">          <script ... key="templates">contentDir: content/templates file: data.yaml</script>
   contentDir: content/templates
   file: data.yaml
   </script>
   ```

   → `validate` fails: `bad indentation of a mapping entry (1:35)`.
   Single-key bodies (`contentDir: content/docs/developer`) stay valid as one-liners — bug only bites
   multi-key blocks.

2. **Multi-key `application/jay-params`** — same collapse, same loud YAML-indentation failure on the
   next parse. ⚠️ assumed (same code path as case 1; not separately reproduced).

3. **Nested `application/jay-validations` suppression** — e.g.
   ```yaml
   some-rule:
     no-lcp-image: false
   ```
   collapses to `some-rule: no-lcp-image: false`; `parseValidationOverrides` either reparses to a
   flattened structure (losing the nested key) or throws and is **silently** swallowed
   (`jay-html-parser.ts:1065-1077`). The suppression disappears and the suppressed warning
   silently returns. ✅ verified (collapse + silent-catch).

## Root cause (verified trace)

```
packages/compiler/compiler-shared/lib/prettify.ts:54-63   // the collapse
    let joined = '';
    for (const line of withPlaceholders.split('\n').map((l) => l.trim())) {
        if (line === '') continue;
        if (joined === '') { joined = line; continue; }
        const gap = joined[joined.length - 1] !== '>' && line[0] !== '<' ? ' ' : '';
        joined += gap + line;
    }
```

For a two-key headless body the loop joins `…key="templates">` + `contentDir: content/templates`
(prev char `>` ⇒ no gap) + `file: data.yaml` (prev char `s`, next `f` ⇒ injected space) + `</script>`
(next char `<` ⇒ no gap), producing the one-line corruption. ✅ verified

`application/jay-data` escapes because `JAY_DATA_SCRIPT` (`prettify.ts:32-33`) swaps those blocks to
placeholders before the join (`:42-45`) and restores them verbatim after (`:70-73`); the comment at
`:26-31` explicitly notes YAML indentation is significant — but the protection was never widened
beyond `jay-data`. js-beautify afterward (`:65-68`) cannot restore newlines already destroyed. ✅
verified

Write path: `syncPageContent` → `prettifyHtml(merged)` (`run-sync.ts:72`) → `writeFile`
(`run-sync.ts:288`). `materialise` serializes via `root.toString()` without prettify unless
`opts.prettify` is passed, and `syncPageContent` passes only `{ preserveOverrides: true }`
(`run-sync.ts:66`) — so the collapse is solely in `prettifyHtml`. ✅ verified

## Fix

**Primary (one-line-ish):** generalize the protected-script regex in `prettify.ts:32-33` from
`application/jay-data` to the significant-whitespace family and reuse the existing
swap-to-placeholder / restore-verbatim code (`prettify.ts:42-45, 70-73`):

- `application/jay-data` (already)
- `application/jay-headless`
- `application/jay-params`
- `application/jay-validations`
- `application/yaml`

All of these have whitespace-significant YAML bodies that must round-trip verbatim through any
HTML prettifier.

**Defense-in-depth (separate, smaller follow-up — decide in review):** make
`parseValidationOverrides` (`jay-html-parser.ts:1065-1077`) **not** swallow YAML errors silently —
surface a validation error instead of `return undefined`. This wouldn't fix the corruption but would
convert the silent suppression-loss (case 3) into a visible failure, so a future regression can't
hide. Prevention-first: a loud parse error is better than a vanished suppression.

## Scope / what this is NOT

- Not a `sync` merge/materialise bug — `sync` output is correct until `prettifyHtml`. Fixing
  `prettify.ts` fixes every current and future caller, not just `sync`.
- Not limited to `sync` conceptually: any caller that prettifies jay-html containing these script
  bodies would corrupt them. `sync` is just the caller that writes back to disk today.

## Verification criteria

- Fixture: a page with (a) a multi-key `jay-headless` body, (b) a multi-key `jay-params` body, and
  (c) a nested `jay-validations` suppression → run `prettifyHtml` (and an end-to-end `sync`) → each
  body is byte-identical in its YAML content (newlines + indentation preserved), and `validate`
  stays clean with the suppression intact.
- Regression: single-key bodies still fine; non-YAML script handling unchanged; normal (non-sync)
  build output unchanged.
- Test via parsed-result / file-content equality (per repo standards) — **not** `toContain` on code.

## Pointers (for the upstream issue)

- Fix site: `packages/compiler/compiler-shared/lib/prettify.ts:32-33, 42-45, 54-63, 70-73`
- Trigger: `packages/jay-stack/stack-cli/lib/run-sync.ts:66, 72, 288`
- Silent-drop site: `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-parser.ts:1065-1077`
- Related docs: `agent-kit/designer/jay-html-components.md`, `agent-kit/designer/data-files-usage.md`,
  and the `sync` command.
- Related DLs: DL#196 (sync), DL#176 (suppressible validations — the suppression this bug drops).

## Implementation Results

Status: **PRIMARY fix implemented and tested.** Defense-in-depth parser change (silent-catch in
`parseValidationOverrides`) intentionally **not** done — it is an explicit separate follow-up.

### What changed

`packages/compiler/compiler-shared/lib/prettify.ts` — widened the protected-script matching from
`application/jay-data` only to the whitespace-significant YAML family, reusing the existing
swap-to-placeholder / restore-verbatim mechanism unchanged:

- Renamed `JAY_DATA_SCRIPT` → `PROTECTED_SCRIPT` and widened its `type` alternation to
  `jay-data | jay-headless | jay-params | jay-validations | yaml`
  (regex: `application\/(?:jay-data|jay-headless|jay-params|jay-validations|yaml)`).
- Renamed `JAY_DATA_PLACEHOLDER` → `PROTECTED_PLACEHOLDER` and `JAY_DATA_PLACEHOLDER_RE` →
  `PROTECTED_PLACEHOLDER_RE` (placeholder markup `data-jay-data-raw="<i>"` left unchanged, so no
  behavior change for existing callers). Updated the comment block to describe the family and cite
  DL#208.
- No change to the swap loop (`html.replace(PROTECTED_SCRIPT, …)` pushes each block to `preserved[]`)
  or the restore loop (`formatted.replace(PROTECTED_PLACEHOLDER_RE, (_m, i) => preserved[Number(i)])`).

### Multiple-block restore

Already correct by construction and unchanged: each matched block is pushed to `preserved[]` in
document order and the placeholder carries its index `i`; restore looks up `preserved[Number(i)]` per
placeholder. So N distinct protected blocks (any mix of the five types) in one document each
round-trip verbatim, not just the first. Verified by a dedicated test with four distinct blocks
(headless + params + validations + yaml) in one document.

### Tests

Added to `packages/compiler/compiler-shared/test/prettify.test.ts` (inline-string style matching the
existing file; full-string `toEqual`, no `toContain`), via a small `extractScriptBody` helper that
pulls a block's inner text out of the prettified output and compares it byte-for-byte:

- multi-key `application/jay-headless` body preserved byte-for-byte;
- multi-key `application/jay-params` body preserved byte-for-byte;
- nested `application/jay-validations` suppression (`some-rule:` → `  no-lcp-image: false`) preserved;
- **multiple distinct protected blocks** (headless + params + validations + yaml) in one document all
  preserved — proves the restore handles more than one;
- full-document case asserting the HTML around the blocks is prettified normally while the bodies stay
  intact (full-string `toEqual`);
- regression: single-key YAML body still intact. The pre-existing word-spacing/ordinary-HTML tests
  remain green.

### Results

- `yarn vitest run test/prettify.test.ts`: 10/10 passing.
- `yarn vitest run` (whole package): 130/130 passing (8 files).
- `yarn build`: clean (JS bundle + d.ts).

### Deviation

None from the primary design. Only renamed the constants to drop the now-misleading `JAY_DATA_`
prefix; the placeholder attribute name was left as-is to avoid churn.
