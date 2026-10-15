# Design Log #220 — Component Script in the Validation Context

**Status:** Implemented. Foundation for DL#221 (code-review validator).

## Decisions for the Implementer (TL;DR)

- **One new optional field, no new validator kind.** `JayHtmlValidationContext` gains `script?: ComponentScript` — the template's sibling `.ts`, **parsed lazily and once**, shared by every validator that touches it.
- **Resolution order is core's:** `<basename>.ts`, then `page.ts` (✅ `stack-cli/lib/validate.ts:622`). One implementation, in `compiler-shared`, used by core and plugins alike.
- **Parse helper lives in `compiler-shared`**, which already has `typescript` as a runtime dependency (✅ `compiler-shared/package.json:40`). Plugins never read the file or call the parser themselves.
- **Findings gain three optional fields:** `ruleId`, `location`, `suppressKey`. Nothing else. ✅ Today a finding has no rule identity and no line (`compiler-shared/lib/plugin-validators.ts:3–9`), so findings cannot be counted per rule — which DL#221's precision gate requires.
- **Line-level suppression becomes a host service:** a `// <namespace>: allow` comment on the finding's line silences it. Generalizes core's `// jay-dom: allow` (✅ `validate.ts:617`, `:638`).
- **First client is core itself:** `checkDirectDocumentAccess` (✅ `validate.ts:619`) moves onto `ctx.script` with identical messages. If its output changes, the foundation is wrong.
- **One run-scoped cache, one resolver.** `validateJayFiles` creates a `ScriptCache` and passes it to both the core per-file loop (✅ `validate.ts:1987`) and `runPluginValidators` (✅ `:2563`). The plugin context is rebuilt per validator per file (✅ `:1810–1857`), so without a shared cache "parse once" would be false.
- **Export check stays page-only, by intent.** `checkPageComponentExport` runs only for `page.jay-html`, on the resolved script (which is then always `page.ts`). Today it checks `page.ts` beside _any_ template (✅ `:578–580`); the narrowing is deliberate — the `page` export is a page-entry rule, not a component rule.
- **Measurement uses the existing `--json` flag** (✅ `cli.ts` `validate --json`, printed by `printJayValidationResult`, `validate.ts:2698–2703`). It gains a `ruleCounts` map; no new flag.

## Background

`jay-stack validate` runs three kinds of rules: core checks in `stack-cli/lib/validate.ts`, plugin jay-html validators (DL#145), and the build-output tier (DL#211). Plugin validators receive a template-only context. DL#221 needs rules that look at the component script — where JavaScript reimplementations of CSS features actually live.

## Problem

1. **No access to the script.** ✅ `JayHtmlValidationContext` carries `body`, `css`, `head`, `contract`, `headlessImports`, `filePath`, `projectRoot`, `validationOverrides` (`plugin-validators.ts:25–52`). A plugin wanting `page.ts` must resolve, read, and parse it itself. Core already does the resolve-and-read twice (`checkPageComponentExport`, `validate.ts:578`; `checkDirectDocumentAccess`, `validate.ts:619`) — a third and fourth copy is the drift we want to avoid.
2. **Findings can't be measured.** ✅ `JayHtmlValidationFinding` is `{ severity, message, suggestion?, element?, attribute? }` (`plugin-validators.ts:3–9`); `ValidationWarning` is `{ file, message, source?, suggestion? }` (`validate.ts:97–102`). No rule id, so no per-rule count; no line, so core smuggles `file:line` into the message string.
3. **Suppression is re-implemented per rule.** Core's DOM rule scans each line for its own comment (`validate.ts:638`). Every new script rule would copy that loop.

## Prior Art / Adjacent Mechanisms

| Mechanism                                                     | Solves?                                                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DL#145 jay-html validator hook                                | ✅ The host. Extended with one field, not forked                                                                                                          |
| Core `checkDirectDocumentAccess` / `checkPageComponentExport` | ✅ Prove sibling-script validation belongs in `validate`; become clients                                                                                  |
| DL#176 suppression audit                                      | ✅ Invariant kept: every warning is suppressible, else it is an error                                                                                     |
| DL#179 `./tools` split                                        | ✅ Validators already load from `./tools` (`validate.ts:1770`); a parsed `SourceFile` handed over by the host adds no compiler import to any serve bundle |
| `compiler-analyze-exported-types`                             | ◑ Existing TypeScript use in the monorepo; reuse its parse settings if they fit, otherwise a plain `ts.createSourceFile`                                  |

**Null hypothesis — a separate `kind: source` validator with its own context and execution loop?** Considered and rejected. It adds a manifest field, a new function type, manifest validation, and a second loop — all to reach a file that is always the template's sibling. A lazy field on the existing context gives the same capability with none of that surface, and validators can cross-check script against template in one function. Revisit only if we need to validate scripts that have **no** template.

**Null hypothesis — eager parse?** No. Most validators never touch the script; the getter parses on first access and caches by path.

## Questions and Answers

**Q1:** What about components whose script has no template (headless `.ts` + contract)?

**A1:** Out of scope for v1 (see pre-mortem). Every rule DL#221 needs has a template.

**Q2:** Raw text or parsed tree?

**A2:** Both, lazily: `text` for line-oriented rules (core's DOM rule stays a line scan), `sourceFile` for structural rules. Neither is computed until read.

**Q3:** Does the plugin need `typescript` to use `sourceFile`?

**A3:** Only as a type import plus the `ts.SyntaxKind` / `ts.isX` helpers to walk the tree, which plugins load from the `./tools` entry — the compiler-permitted entry (DL#179). The parse itself happens once, in the host.

**Q4:** Why not also add `confidence` and `anchor` to findings?

**A4:** DL#221 ships deterministic rules only, so `confidence` would have one value — dead surface. Add it the day a non-deterministic rule is admitted, not before.

**Q5:** Migrating `checkPageComponentExport` onto the shared resolver changes which file it checks. Is that intended?

**A5:** Yes. Today it checks `page.ts` beside every template (`validate.ts:578–580`), while the DOM check uses `<basename>.ts` then `page.ts` (`:622`). After migration the export check runs **only when the template is `page.jay-html`**, on `ctx.script` — which for that template always resolves to `page.ts`. The one observable change: a component template `foo.jay-html` sharing a directory with a `page.ts` no longer triggers the export check from `foo`; the directory's own `page.jay-html` (if any) still does. Verification case 6 pins this.

**Q6:** Core checks run in the per-file loop (`validate.ts:1987–2079`); plugin contexts are built later in `runPluginValidators` (`:1747`, called at `:2563`). How does each get the same script without parsing twice?

**A6:** `validateJayFiles` creates one `ScriptCache` (a `Map<absoluteScriptPath, ComponentScript>`) at the start of the run and passes it to both. `resolveComponentScript(jayHtmlPath, projectRoot, cache)` returns the cached entry when present; `text` and `sourceFile` are lazy getters on that entry, so the first reader pays and everyone else shares. The cache dies with the run — no module-level state.

**Q7:** What exactly is "a plugin defect" for a warning without `suppressKey`?

**A7:** The same shape as a broken validator export today (`validate.ts:1777–1785`): an error `{ file: 'plugin:<name>', stage: 'plugin', source: '<plugin>/<validator>', message: 'Validator "<name>" emitted a warning without suppressKey: "<message>"' }`, and the warning itself is still reported. It fails `validate` for plugin authors running their own tests, which is the point; it never fires for well-formed plugins.

**Q8:** Why not a new `--report json` flag?

**A8:** `validate --json` already serializes the full `ValidationResult` to stdout and the process exits 1 when `valid` is false (`run-validate.ts:28`). Adding fields to that result is strictly less surface than a second output mode.

## Design

### Context

```typescript
// compiler-shared/lib/plugin-validators.ts
export interface ComponentScript {
  /** Relative to projectRoot, e.g. src/pages/shop/page.ts */
  filePath: string;
  /** Lazily read; cached. */
  readonly text: string;
  /** Lazily parsed with ts.createSourceFile; cached per path for the whole validate run. */
  readonly sourceFile: import('typescript').SourceFile;
}

export interface JayHtmlValidationContext {
  // ...existing fields unchanged
  /** Sibling component script (<basename>.ts, then page.ts). Absent when there is none. */
  script?: ComponentScript;
}

/** One per validate run, keyed by absolute script path. */
export type ScriptCache = Map<string, ComponentScript>;

/** Shared by core and plugins — the single place that knows the resolution order. */
export function resolveComponentScript(
  /** Absolute, or relative to projectRoot — the core loop has absolute paths, the plugin pass relative. */
  jayHtmlPath: string,
  projectRoot: string,
  cache: ScriptCache,
): ComponentScript | undefined;
```

### Wiring in `validateJayFiles`

```typescript
const scriptCache: ScriptCache = new Map();
// core per-file loop (validate.ts:1987)
const script = resolveComponentScript(jayFile, projectRoot, scriptCache);
checkDirectDocumentAccess(script); // was checkDirectDocumentAccess(jayFile)
if (path.basename(jayFile) === 'page.jay-html') checkPageComponentExport(script);
// plugin pass (validate.ts:2563)
await runPluginValidators(projectRoot, parsedFiles, errors, warnings, scriptCache);
//   ...inside, when building ctx (validate.ts:1810):
//   script: resolveComponentScript(relativePath, projectRoot, scriptCache),
```

### Finding

```typescript
export interface JayHtmlValidationFinding {
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
  element?: string;
  attribute?: string;
  /** 'css-first/allow-timer-animation' — namespace/key. */
  ruleId?: string;
  /** File the finding points at (defaults to the template) and 1-based line. */
  location?: { file?: string; line: number };
  /** Key that silences it in <script type="application/jay-validations">. */
  suppressKey?: string;
}
```

`ValidationWarning` / `ValidationError` (`validate.ts:89–102`) gain the same three fields, so core rules carry them too.

### Host suppression

Before a finding is reported, the host drops it when either holds:

1. `location` points into a file whose line `location.line` contains `// <namespace>: allow`, where namespace is the `ruleId` prefix.
2. `validationOverrides[namespace][suppressKey] === true`.

A **warning** with no `suppressKey` is reported as a plugin defect — DL#176 enforced mechanically instead of by audit. The defect is an error in the existing plugin-failure shape (`validate.ts:1777–1785`):

```typescript
errors.push({
  file: `plugin:${plugin.name}`,
  stage: 'plugin',
  source, // '<plugin>/<validator>'
  message: `Validator "${validatorDef.name}" emitted a warning without suppressKey: "${finding.message}"`,
});
```

Errors need no `suppressKey` (DL#176 permits unsuppressible errors).

### Trace — core DOM rule on the new path

1. `validate` builds the context for `src/pages/shop/page.jay-html`; `script` resolves to `src/pages/shop/page.ts` via `resolveComponentScript` (replacing `validate.ts:620–623`).
2. The rule reads `ctx.script.text`, splits lines, matches `DOCUMENT_ACCESS_PATTERNS` (`validate.ts:607–615`) — unchanged.
3. It emits `{ ruleId: 'jay-dom/direct-document-access', location: { file: 'src/pages/shop/page.ts', line: 42 }, suppressKey: 'allow-direct-document-access', message }` — the message text exactly as today (`validate.ts:643–645`).
4. The host suppression service finds `// jay-dom: allow` on line 42 and drops it — replacing the rule's own check at `validate.ts:638`.

Side effect, intentional: the rule also becomes page-suppressible via `jay-dom: { allow-direct-document-access: true }` in `application/jay-validations`, the DL#176 mechanism every other warning already has.

### `--json` output

The existing `validate --json` (stdout, `JSON.stringify(result)`, exit 1 when `valid` is false) keeps every current field. Changes:

```typescript
export interface ValidationWarning {
  file: string; // template the finding came from (unchanged)
  message: string;
  source?: string; // '<plugin>/<validator>' (unchanged)
  suggestion?: string;
  ruleId?: string; // new
  location?: { file?: string; line: number }; // new
  suppressKey?: string; // new
}
// ValidationError: same three additions.

export interface ValidationResult {
  // ...existing fields unchanged
  /** Findings after suppression, counted per ruleId. Findings without a ruleId count under '(unidentified)'. */
  ruleCounts: Record<string, number>; // new
}
```

Example excerpt:

```json
{
  "valid": true,
  "warnings": [
    {
      "file": "src/pages/shop/page.jay-html",
      "source": "code-review-validator/css-first",
      "ruleId": "css-first/allow-presentational-scroll-handler",
      "location": { "file": "src/pages/shop/page.ts", "line": 31 },
      "suppressKey": "allow-presentational-scroll-handler",
      "message": "Scroll handler only toggles classes — CSS can own this",
      "suggestion": "position: sticky, or animation-timeline: scroll()"
    }
  ],
  "ruleCounts": {
    "css-first/allow-presentational-scroll-handler": 1,
    "jay-dom/direct-document-access": 0
  }
}
```

Console output keeps its current sections, and prints `location.file:location.line` when present.

## Examples

✅ Line-level suppression, handled by the host

```typescript
// page.ts
const canvas = document.createElement('canvas'); // jay-dom: allow — offscreen export canvas
```

✅ Page-level suppression for a plugin rule

```html
<script type="application/jay-validations">
  css-first:
    allow-timer-animation: true
</script>
```

❌ A plugin re-implementing suppression or file reading

```typescript
const text = fs.readFileSync(path.join(dir, 'page.ts'), 'utf-8'); // use ctx.script.text
if (line.includes('css-first: allow')) continue; // the host already does this
```

## Implementation Plan

1. **Types** — `ComponentScript`, the `script` field, three finding fields, mirrored on `ValidationWarning`/`ValidationError`. Tests: types only, nothing behaves differently.
2. **`resolveComponentScript` + `ScriptCache`** in `compiler-shared` with lazy `text`/`sourceFile`. Tests: resolution order, missing file, unparsable file (returns a `sourceFile` with diagnostics, never throws), one parse for many reads through one cache.
3. **Wiring** — create the cache in `validateJayFiles`; thread it into the core loop and `runPluginValidators`; set `ctx.script`.
4. **Host suppression service** in `validate.ts`. Tests: line comment, page override, plugin-defect error for an unkeyed warning.
5. **Migrate core** — `checkDirectDocumentAccess` and `checkPageComponentExport` consume the resolved script (export check page-only, Q5). Existing stack-cli tests must pass **unchanged**, plus the new Q5 case.
6. **`ruleCounts`** in `ValidationResult`; `location` printed in console output.

Steps 1, 2, 5 are the prerequisites DL#221 Phase 2 needs; step 6 is the prerequisite for DL#221's corpus gate.

## Scope Pre-Mortem

| Not handled                                      | Decision                                          |
| ------------------------------------------------ | ------------------------------------------------- |
| Scripts without a template (headless components) | Defer — no v1 rule needs it                       |
| Helper modules imported by the script            | Defer, own DL — needs a module graph              |
| Type-checked analysis (`ts.Program`)             | Defer — syntactic tree only                       |
| Markdown report                                  | Defer — json first; markdown is a rendering of it |
| Autofix                                          | Out of scope                                      |

## Verification Criteria

1. Two validators reading `ctx.script.sourceFile` for the same page cause **one** parse (parse counter in test).
2. Core's direct-DOM warnings are byte-identical before and after migration; `// jay-dom: allow` still suppresses them, now via the host.
3. A plugin warning with no `suppressKey` surfaces as a `stage: 'plugin'` error on `plugin:<name>`, and the warning itself is still reported.
4. `jay-stack validate --json` on `examples/jay-stack/fake-shop` includes `ruleCounts`, and every pre-existing JSON field is unchanged.
5. A page with no sibling script: `ctx.script` is `undefined`, no error.
6. Export check: `page.jay-html` + `page.ts` without a `page` export → error (as today); `foo.jay-html` + `page.ts` in the same directory, no `page.jay-html` → **no** export error (intentional change, Q5).
7. Core DOM rule and one plugin validator over the same page share one `ComponentScript` instance (same object from the cache).

## Trade-offs

- **The host now owns a TypeScript parse.** Lazy and cached, so pages whose validators don't touch the script pay nothing.
- **Optional fields mean mixed findings during migration** — some rules carry `ruleId`, older ones don't. Accepted over a breaking type; the console output works either way.
- **"Sibling only" will miss logic in helper modules.** Deliberate; the sibling is where page behavior lives today.

## Implementation Results

- **compiler-shared** — `ComponentScript`, `ScriptCache`, extended `JayHtmlValidationFinding` / `JayHtmlValidationContext`, `resolveComponentScript()` with lazy `text` / `sourceFile` (`lib/component-script.ts`). Tests: `test/component-script.test.ts` (5/5).
- **stack-cli** — `validation-findings.ts` (line + page suppression, `ruleCounts`); core `checkDirectDocumentAccess` / `checkPageComponentExport` on resolved script; page export only for `page.jay-html`; plugin findings through host suppression. Tests: `test/validation-findings.test.ts` (4/4).
- **suppressKey contract (review fix)** — End-user `validate` no longer errors when a third-party plugin emits warnings without `suppressKey` (site authors cannot fix plugin code). `findingsMissingSuppressKey()` in compiler-shared; `validate-plugin` runs a **smoke** probe on built `./tools` handlers (load/handler failures and missing `suppressKey`: warning by default, error with `--strict`; handler loading matches stack-cli). Full gate: plugin unit tests. Line suppression accepts `namespace: allow` in block or line comments.
- **Review pass v2 (2026-10-14)** — `component-script` and css-first script rules parse through `@jay-framework/typescript-bridge`; code-review-validator externalizes all `@jay-framework/*` and lists the bridge as a peer dependency.
- **Corpus** — `examples/jay-stack/fake-shop` `validate --json` includes `ruleCounts`; zero `css-first` warnings with code-review-validator enabled.
