# Design Log #186 — Validator Flags the Compiler-Injected `jc` Attribute as an Undeclared Contract Prop

> The jay-html parser injects a marker attribute `jc="<contractName>"` onto inlined headfull component
> instances (`<jay:Name />`). `jay-stack validate`'s headfull/headless prop check then treats `jc` as a
> user-passed prop and warns:
> `<jay:site-header> passes attribute "jc" but the "site-header" contract does not declare it as a prop`.
> The attribute is not in the author's template — it is compiler-generated — so the warning is a
> false positive the author cannot legitimately resolve. Fix: add `jc` to the validator's
> `HEADLESS_SKIP_ATTRS`.

## Background

- A page embeds a headfull component with a self-closing instance, e.g.
  `<jay:SiteHeader />` / `<jay:SiteFooter />`, declared via
  `<script type="application/jay-headfull" src="..." names="SiteHeader" contract="...site-header.jay-contract">`.
- During parsing, `jay-html-parser.ts` inlines an empty component instance's content and stamps a marker
  attribute `jc` (contract name) on the tag so later compiler passes can identify the instance. Two
  _different functions_ do this — and only one of them is on the `jay-stack validate` path:

  ```ts
  // Site A — parseHeadfullFSImports, jay-html-parser.ts:1174-1181  ← THE VALIDATE PATH
  //   Reached via parseJayFile (jay-html-parser.ts:1720), which validate.ts calls (validate.ts:1104).
  //   Injects `jc` only.
  for (const jayTag of jayTags) {
    if (jayTag.innerHTML.trim()) continue;
    jayTag.set_content(jayHtmlBody.innerHTML);
    jayTag.setAttribute('jc', contractName);
  }

  // Site B — injectHeadfullFSTemplatesRecursive, jay-html-parser.ts:921-925  ← NOT the validate path
  //   Reached only via injectHeadfullFSTemplates (dev-server, stack-server-build discovery,
  //   production-build). Injects `style="display: contents"` AND `jc`.
  for (const jayTag of jayTags) {
    if (!jayTag.innerHTML.trim()) {
      jayTag.set_content(jayHtmlBody.innerHTML);
      jayTag.setAttribute('style', 'display: contents');
      jayTag.setAttribute('jc', contractName);
    }
  }
  ```

- Immediately after Site A injects `jc`, `parseHeadfullFSImports` checks whether the instance has a
  backing code file (`.ts`/`.js`, `jay-html-parser.ts:1190-1194`). **Structural** headfull components
  (no code file, DL#162) are _unwrapped_ — the `<jay:...>` tag is replaced by its children and the `jc`
  marker is discarded (`jay-html-parser.ts:1198-1203`). So `jc` survives to the validator **only** on
  `.ts`-backed instances such as `SiteHeader` / `SiteFooter`.

- `jay-stack validate` walks `<jay:...>` tags and checks that every non-directive attribute passed to an
  instance is a declared contract **prop** (`stack-cli/lib/validate.ts:763-796`). Directive and
  compiler-internal attributes are excluded via a skip-set `HEADLESS_SKIP_ATTRS`
  (`validate.ts:694-710`).

## Problem

Validating the misprint-goods / onsko examples (which use `<jay:SiteHeader />` and `<jay:SiteFooter />`
on many pages) produces, per page, two warnings:

```
⚠ src/pages/privacy-policy/page.jay-html
  <jay:siteheader> passes attribute "jc" but the "site-header" contract does not declare it as a prop.
  Add to siteheader.jay-contract: props: [{ name: jc, type: string }]
⚠ src/pages/privacy-policy/page.jay-html
  <jay:sitefooter> passes attribute "jc" but the "site-footer" contract does not declare it as a prop.
  Add to sitefooter.jay-contract: props: [{ name: jc, type: string }]
```

repeated across every page that embeds the header/footer (≈17 warnings in `jay-onsko-shop`, ≈21 in
`misprint-goods-jay`). The author's template contains **no** `jc` attribute:

```html
<jay:SiteHeader />
...
<jay:SiteFooter />
```

The warning's own remediation — "Add to `site-footer.jay-contract`: props: [{ name: jc, type: string }]" —
is incorrect: `jc` is an internal compiler marker, not a component prop. Following it would pollute every
contract with a bogus prop, and would still be wrong (the value is the contract name, not user data).

## Root Cause

`jc` is injected on the validate path by `parseHeadfullFSImports` (`jay-html-parser.ts:1180`, Site A)
but is **absent** from the validator's skip-set, so the prop-coverage check counts it as a passed prop:

```ts
// stack-cli/lib/validate.ts:694-710
const HEADLESS_SKIP_ATTRS = new Set([
  'foreach',
  'if',
  'ref',
  'trackby',
  'slowforeach',
  'jayindex',
  'jaytrackby',
  'when-resolved',
  'when-loading',
  'when-rejected',
  'accessor',
  'props',
  'key',
  'jay-coordinate-base',
  'jay-scope',
  // 'jc'  ← MISSING
]);

// :776-795
for (const attrName of Object.keys(attrs)) {
  if (!HEADLESS_SKIP_ATTRS.has(attrName.toLowerCase())) {
    passedProps.add(attrName); // 'jc' wrongly added here
  }
}
// ... 'jc' not in contract.props → warning emitted
```

The set already excludes other compiler/framework-injected attributes (`jay-coordinate-base`,
`jay-scope`, `key`, directive names). `jc` — same class of attribute — was simply never added, so the
validator flags the compiler's own output.

> Note: `style` is **not** a concern for the validator. The only site that injects
> `style="display: contents"` is Site B (`injectHeadfullFSTemplatesRecursive`, `:924`), which runs in the
> dev-server / build discovery / production-build pipelines — **not** in `jay-stack validate`. Validate
> parses via `parseJayFile` → `parseHeadfullFSImports` (Site A, `:1180`), which injects **only** `jc`. So
> `jc` is the sole compiler-injected attribute that can reach the prop check, and it is the only one that
> needs skipping. (If a future change routes the style-injecting path into validate, revisit this.)

## How to Reproduce

```bash
cd examples/misprint-goods-jay   # or jay-onsko-shop
npm run validate
# → repeated: <jay:siteheader>/<jay:sitefooter> passes attribute "jc" ... does not declare it as a prop
```

Any page embedding an **empty**, **`.ts`-backed** headfull component instance (`<jay:Name />`) whose
contract does not declare a `jc` prop reproduces it. Two cases do **not** warn: (1) an instance with
inline children (non-empty) never gets `jc` injected (`if (jayTag.innerHTML.trim()) continue`); (2) a
**structural** instance with no backing code file is unwrapped and its `jc` discarded
(`jay-html-parser.ts:1198-1203`).

## How to Fix

Add `jc` to the validator's skip-set — it is a compiler marker, never a user prop:

```ts
// stack-cli/lib/validate.ts:694
const HEADLESS_SKIP_ATTRS = new Set([
  'foreach',
  'if',
  'ref',
  'trackby',
  'slowforeach',
  'jayindex',
  'jaytrackby',
  'when-resolved',
  'when-loading',
  'when-rejected',
  'accessor',
  'props',
  'key',
  'jay-coordinate-base',
  'jay-scope',
  'jc', // compiler-injected marker (parseHeadfullFSImports, jay-html-parser.ts:1180)
]);
```

`jc` is the only attribute that needs adding — no `style` skip is required, because the style-injecting
path (Site B) never runs under `jay-stack validate` (see Root Cause note).

### Prevention

- The skip-set and the parser's injected-attribute names are two lists that must stay in sync. Consider
  exporting the injected-marker names from the compiler (single source of truth) and having the validator
  import them, so a future injected marker cannot silently reintroduce this class of false positive.
- A regression test should assert that a page embedding `<jay:Name />` (empty, contract without a `jc`
  prop) validates with **no** attribute-prop warnings.

### Tests (regression, in the jay repo)

1. **`stack-cli` validate test** — a page with an empty headfull instance `<jay:Name />` whose contract
   declares no props produces **no** "passes attribute" warning (specifically none for `jc`). Full-string
   assertion on the collected warnings (empty for this check).
2. **`stack-cli` validate test (control)** — a genuinely undeclared, author-written attribute
   (e.g. `<jay:Name foo="x" />`) still warns, so the skip-set doesn't over-suppress real issues.

## Verification Criteria

**Automated (must exist in the jay repo before this is "done"):**

- [ ] Validate test: empty headfull instance → no `jc` attribute-prop warning.
- [ ] Validate test (control): author-supplied undeclared attribute still warns.
- [ ] Type-check + build clean for `stack-cli`.

**Manual (end-to-end):**

- [ ] `cd examples/misprint-goods-jay && npm run validate` — no `jc` warnings (drops ≈21 warnings).
- [ ] `cd examples/jay-onsko-shop && npm run validate` — no `jc` warnings (drops ≈17 warnings).
- [ ] Contracts (`site-header.jay-contract`, `site-footer.jay-contract`) are **not** modified to add a
      `jc` prop — the fix is validator-side only.

## Relationship to Other Logs

- **#162 (structural headfull component)** — added the code-file check and the _unwrap_ branch in this
  same `parseHeadfullFSImports` block (`:1190-1203`). Structural (no-`.ts`) instances are unwrapped and
  lose `jc`; the examples' `SiteHeader`/`SiteFooter` are `.ts`-backed, so they take the **other** branch
  that keeps the `jc` marker — which is why the false positive appears on them and not on structural ones.
- **#181 (headfull component override)** / **#51 (jay-html with contract references)** — background on
  headfull component instances and contract prop passing that this validator check governs.
- **#176 (validation warning suppression audit)** — related validator-hygiene work; this is a
  false-positive to eliminate at the source rather than suppress.

## Implementation Results (2026-09-08)

**Status: implemented — validator-side only.** Added `'jc'` to `HEADLESS_SKIP_ATTRS` in
`packages/jay-stack/stack-cli/lib/validate.ts` with the comment
`// compiler-injected marker (parseHeadfullFSImports, jay-html-parser.ts:1180)`. No `style` skip added
(Site B never reaches validate) and no `.jay-contract` files modified.

**Tests** (`packages/jay-stack/stack-cli/test/validate.test.ts`, direct
`checkHeadlessInstanceProps(...)` unit style, asserting on the returned warnings array with `toEqual`; no
`toContain`): empty `.ts`-backed instance carrying `jc` → no warning; control — an author-supplied
undeclared attribute (`foo="x"`) still emits the full "passes attribute" warning (full-string asserted),
proving the skip-set doesn't over-suppress.

**Results:** stack-cli suite 68/68 (+2 new); monorepo `yarn confirm` green. No deviations from the
design.
