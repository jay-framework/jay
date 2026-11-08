# Design Log #232 — Project-level validators for plugins (and moving the inlined checks out of core)

Status: **[Design]**. Builds on DL#231 §6.5 (introduces the hook for the editing-policy plugin), DL#145 (per-file validators), DL#175/#213/#214/#218 (the checks that are inlined in core today), DL#179 (compiler-free plugin runtime).

## 1. Decisions for the Implementer (TL;DR)

1. **One new plugin extension point: `projectValidators`** in `plugin.yaml`, run by `jay-stack validate` after the per-file pass. A handler gets the project, not a file, and returns findings in the existing error/warning shape.
2. **First consumers:** DL#231 policy-file validation, then the **SEO/discovery checks that are hard-coded in `validate.ts`** move into `@jay-framework/seo-validator`: `public/robots.txt` presence, `site.baseUrl`, `site.name`, and the ARD (`/.well-known/ard.json`) presence + shape check (`validate-ard.ts`).
3. **Not moved** (framework concerns, or need core-internal data): error-pages check (DL#218), broken internal links (DL#210) and build-output tier (DL#211), design-system reuse/no-design-system/component-no-template (DL#200/#207). Reason per item in §6.
4. **Behavior change, accepted** (no backward compatibility, CLAUDE.md): a project that does not install `seo-validator` stops getting the robots/sitemap/site-identity/ARD warnings. Mitigation: `create-jay` scaffolds `seo-validator` by default (Q3).
5. **Config keys stay where they are** (`.jay` → `site.*`, `validations.allow-no-ard`); a validator that needs config loads it via `projectRoot` (it is **not** in the context — `JayConfig` lives in `stack-cli`, above the type's home `compiler-shared`; see §12).
6. **Hook context is deliberately small:** `projectRoot` + the plugin's own `settings`. No parsed `.jay` config, no parsed jay-html (that stays the per-file hook's job); widen only when a validator needs it (decision C, §12).

## 2. Background

DL#145 gave plugins a per-file jay-html validator and explicitly deferred cross-file validators (Q4). Since then core grew an inline "Project-level validations" block in `validateJayFiles` (✅ `stack-cli/lib/validate.ts`, comment `// --- Project-level validations (DL#175) ---` around line 2363) that checks things unrelated to compilation: robots.txt, `site.baseUrl`, `site.name` (DL#213), ARD (DL#214, `validate-ard.ts`), and error pages (DL#218). The SEO plugin already owns the per-page SEO rules (✅ `seo-validator/lib/validators/seo-validator.ts`), so the project-level SEO checks live in the wrong package.

## 3. Problem

Plugins cannot validate anything that is not one jay-html file, so project-wide concerns are either impossible (editing policy, DL#231) or hard-coded in core. Core therefore carries plugin-specific knowledge (SEO, agent discovery) that cannot be turned off, extended, or versioned with the plugin.

## 4. Prior Art / Adjacent Mechanisms

| Mechanism                                           | Solves                                                                                                                          | Constrains                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| DL#145 `validators`                                 | Per-file jay-html checks                                                                                                        | One parsed file in; no project scope                        |
| `runPluginValidators` (✅ `validate.ts:1748`)       | Discovery via `scanPlugins`, handler loading (local path, or `<pkg>/tools` entry per DL#179), error reporting for load failures | Per-file loop; reusable for the loader part                 |
| `.jay` config `validations:` (✅ `config.ts:40-50`) | Project-level suppressions (`allow-no-ard`, `allow-no-error-pages`)                                                             | Typed keys in core config; plugins would read, not own them |
| `jay-stack validate-plugin` / `plugin-validator`    | Validates `plugin.yaml` shape at plugin build time                                                                              | Must learn the new manifest field                           |
| Inline project-level block (DL#175)                 | Today's implementation of the checks we move                                                                                    | Core-only                                                   |

Null hypothesis: reuse the per-file hook with a fake file? No: it is invoked once per jay-html file with a parsed DOM, and a project with zero pages would never run it.

## 5. Questions and Answers

- **Q1. Why not leave the checks in core and only add the hook for the policy?** A. Two workarounds for one obstacle (CLAUDE.md "name the shared cause"): core's inline block is the same missing hook. Moving the SEO checks is also the proof that the hook is sufficient beyond one consumer.
- **Q2. Should seo-validator also take agent discovery (ARD), or a new plugin?** A. Keep in `seo-validator` for now (discoverability for search engines and agents is one concern in the checks today: `llms.txt`, JSON-LD, ARD). Split later if it grows.
- **Q3. Projects without seo-validator lose the warnings; acceptable?** A. Yes, plugins are opt-in (DL#145 Q3). `create-jay` default plugin list should include `seo-validator` (⚠️ check the scaffold list in `create-jay` and DL#228 before changing).
- **Q4. Suppression keys.** A. `.jay` `validations.allow-no-ard` etc. stay; a validator reads them by loading `.jay` via `projectRoot` (not from the context — decision C, §12). No namespacing change in this log.
- **Q5. Does the hook run under `--compile-only`?** A. No: ✅ `validateJayFiles` returns before the project-level block when `compileOnly` is set; the hook runs at the same point, so compile-only stays fast.
- **Q6. Tier-2 (`--tier-2`) projects?** A. Unchanged; build-output validation stays in core.

## 6. Design

### 6.1 Manifest and handler

```yaml
# plugin.yaml
projectValidators:
  - name: seo-site
    handler: validateProject
    description: robots.txt, site identity, ARD
```

```ts
// @jay-framework/compiler-shared (next to JayHtmlValidatorFn — the home validator-only
// plugins already import from; full-stack-component is for runtime builders, not validators)
export interface ProjectValidationContext {
  projectRoot: string;
  settings?: unknown; // the plugin's own settings, as for other plugin entry points
  // NOTE (decision C, §12): no `config`. JayConfig lives in stack-cli (above compiler-shared),
  // so it can't be referenced here. A validator that needs .jay config loads it via projectRoot.
}
export interface ProjectFinding {
  severity: 'error' | 'warning';
  file: string; // project-relative, or `.jay`
  message: string;
  suggestion?: string; // agent-actionable, as in DL#145
}
export type ProjectValidatorFn = (
  ctx: ProjectValidationContext,
) => ProjectFinding[] | Promise<ProjectFinding[]>;
```

Loading mirrors `runPluginValidators`: same `scanPlugins` pass, local plugins by relative path, npm plugins from `<pkg>/tools` (DL#179), load failures reported as `stage: 'plugin'` errors with `source: <plugin>/<name>`. Results fold into `errors`/`warnings` with `source: 'plugin:<name>/<validator>'` so they print grouped and are test-filterable. The validator names appear in `ValidationResult.pluginValidators`.

### 6.2 What moves, what stays

| Check (today in `validate.ts`)                                      | DL        | Destination                       | Why                                                                                                                         |
| ------------------------------------------------------------------- | --------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `public/robots.txt` missing                                         | #175      | seo-validator `projectValidators` | SEO                                                                                                                         |
| `site.baseUrl` missing (sitemap)                                    | #175      | seo-validator                     | SEO                                                                                                                         |
| `site.name` missing (Organization JSON-LD, llms.txt)                | #213      | seo-validator                     | SEO / discovery                                                                                                             |
| ARD presence + shape, `allow-no-ard` (`validate-ard.ts`, 175 lines) | #214      | seo-validator (file moves)        | discovery                                                                                                                   |
| Branded 404/5xx error pages                                         | #218      | **stays in core**                 | Framework routing feature (error pages resolved by status); not optional                                                    |
| Broken internal links                                               | #210      | **stays in core**                 | Needs the route scanner and parsed pages                                                                                    |
| Build-output tier                                                   | #211      | **stays in core**                 | Needs build artifacts and the link oracle                                                                                   |
| NO-DESIGN-SYSTEM, COMPONENT-NO-TEMPLATE, reuse summary              | #200/#207 | **stays in core**                 | Depends on region/template-import counters computed in the per-file pass; revisit if the context later carries parsed files |
| Editing policy file                                                 | #231      | editing-policy plugin             | New                                                                                                                         |

### 6.3 Core after the change

`validateJayFiles` keeps a single generic step, `runProjectValidators(projectRoot, errors, warnings)`, placed where the DL#175 block is, after `compileOnly` returns. The DL#175/#213/#214 code and `validate-ard.ts` are deleted from core; `config.validations['allow-no-ard']` typing stays.

## 7. Implementation Plan

1. **P0 — hook.** Types in compiler-shared; `projectValidators` in the plugin manifest type and in `plugin-validator`'s schema check (`validate-plugin`); `runProjectValidators` in stack-cli reusing the `runPluginValidators` loader (extract the shared "load handler" function). Fixture plugin test: finding surfaces as warning/error with source; load failure surfaces as `plugin` error; skipped under `compileOnly`. (Shared with DL#231 P0/P4, do once.)
2. **P1 — move robots/baseUrl/site.name** into `seo-validator` as `validateProject`; move their tests to `seo-validator/test/` with fixtures; remove from `validate.ts`.
3. **P2 — move ARD**: `validate-ard.ts` into `seo-validator`; keep `allow-no-ard` handling via `ctx.config`; remove from core.
4. **P3 — scaffold and docs**: `create-jay` default plugins; agent-kit validation guide lists project-level validators and the manifest field; DL#175/#213/#214 index rows get a "(moved to seo-validator, DL#232)" note (append-only, the old logs are not rewritten).
5. **P4 — editing-policy plugin** consumes the same hook (DL#231 §6.2).

## 8. Scope pre-mortem

- Not handled: moving error-pages, link, build-output and design-system checks (§6.2). If a second plugin needs parsed files at project scope, widen the context then; do not widen speculatively.
- Per-validator ordering and inter-validator dependencies: none, validators are independent; output order is plugin scan order.
- Third-party plugins: the manifest field is additive; old plugins keep working.

## 9. Verification criteria

1. `jay-stack validate` on a project with `seo-validator` installed produces the same robots/baseUrl/site.name/ARD findings (message, suggestion, severity) as before, now with `source: plugin:seo-validator/seo-site` (fixture comparison with `toEqual`, no `toContain`).
2. The same project without `seo-validator` produces none of them.
3. `allow-no-ard: true` still suppresses the ARD nudge; the ARD shape check still runs when the file exists.
4. `--compile-only` runs no project validator.
5. A project validator that throws or fails to load yields a `plugin` stage error naming `<plugin>/<validator>`, and validation continues.
6. `jay-stack validate-plugin` rejects a malformed `projectValidators` entry.
7. After P2, `validate.ts` has no reference to `robots.txt`, `site.baseUrl`, `site.name`, or ARD.

## 10. Trade-offs

- Small hook now, parsed-files context later: keeps the surface minimal at the cost of one more design if a validator needs it.
- SEO nags become opt-in: cleaner core, but sites that never installed the plugin lose coverage unless the scaffold includes it.
- Leaving error pages and design-system checks in core means core still has a project-level block; it shrinks to framework-owned concerns only.

## 11. Implementation Readiness — P0 (verified 2026-11-08)

Reviewed because DL#231 depends on this hook (DL#231 is the first consumer). P0 anchors traced to real code:

| P0 item                                    | Anchor                                                                                                                                                                   | Status |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Types next to `JayHtmlValidatorFn`         | `compiler-shared/lib/plugin-validators.ts:3-57` (`JayHtmlValidationFinding {severity,message,suggestion}` to mirror)                                                     | ✅     |
| Correct home is compiler-shared            | validator-only plugins (a11y, seo) depend on `compiler-shared` only and import `JayHtmlValidatorFn` from it; full-stack-component holds runtime builders, not validators | ✅     |
| "Load handler" extraction                  | `validate.ts:1762-1798` is a self-contained try/catch (load local path or `<pkg>/tools`, DL#179); per-file loop `1800-1889` stays                                        | ✅     |
| `runProjectValidators` invocation          | beside `runPluginValidators` at `validate.ts:2574`                                                                                                                       | ✅     |
| `--compile-only` skip                      | `validate.ts:2344` returns _before_ 2574 — automatic, no extra code                                                                                                      | ✅     |
| Schema check to mirror                     | `validate-plugin.ts:548-586` (validators block)                                                                                                                          | ✅     |
| Capability list + no-capability suggestion | `validate-plugin.ts:342-354`, `:376` — add `manifest.projectValidators` to both                                                                                          | ✅     |
| Manifest is `Record<string,any>`           | `plugin-scanner.ts:14` — no manifest _type_ change needed                                                                                                                | ✅     |

**Design corrections made from the review:**

- **Context `config` dropped (decision C).** `JayConfig` is defined in `stack-cli/lib/config.ts:6` — above both `compiler-shared` and `full-stack-component` in the dep graph — so the context (which must live in compiler-shared so validator-only plugins can import it without taking a full-stack-component/stack-cli dep) cannot reference it. Context is `{ projectRoot, settings? }`; a validator needing `.jay` config loads it via `projectRoot`.
- **Consequence for P1/P2 (SEO move):** the moved robots/baseUrl/site.name/ARD checks read config themselves via `projectRoot` (own `.jay` read), not from the context. Deferred to P1; not a P0 or DL#231 concern.

## 12. Implementation Results — P0 (2026-11-08)

**Status: P0 implemented and green.** The `projectValidators` hook exists end-to-end; P1–P4 (SEO-check move, scaffold, docs, editing-policy consumer) are not started.

Files changed:

- `compiler-shared/lib/plugin-validators.ts` — added `ProjectValidationContext { projectRoot; settings? }`, `ProjectValidationFinding { severity; file; message; suggestion? }`, `ProjectValidatorFn`. (`index.ts` already `export *`s the module.)
- `compiler-shared/lib/plugin-resolution.ts` — added `projectValidators?: Array<{name;handler;description?}>` to `PluginManifest`.
- `plugin-validator/lib/validate-plugin.ts` — `projectValidators` added to the capability list and no-capability suggestion; a schema block mirroring `validators` (array check, `name`/`handler` required, `validateHandlerRef(..., './tools')`); `needsToolsEntry` now treats it as a tools capability.
- `stack-cli/lib/validate.ts` — extracted `loadPluginToolsHandler` (shared by both runners, DL#232 P0's "extract the shared load handler"); refactored `runPluginValidators` to use it; added `runProjectValidators(projectRoot, errors, warnings)`; invoked after the per-file pass (so `--compile-only`'s early return skips it); project-validator names fold into `ValidationResult.pluginValidators`.

Tests: `stack-cli/test/validate.test.ts` — new `project-level plugin validators (DL#232)` block (finding→error+warning with `source` via `toEqual`; load failure → `plugin`-stage error; skipped under `--compile-only`) with fixture `test/fixtures/validate/project-validator/`. `plugin-validator/test/validate-plugin.test.ts` — new `projectValidators` block (missing `handler`, non-array, valid-with-`./tools`). All green: stack-cli validate 95/95, plugin-validator 28/28, compiler-shared 130/130; all three type-check.

Deviations from design:

- **`loadPluginToolsHandler` "not a function" message** now reports the _actual_ expected export (`validate` for local, the declared handler name for npm) instead of always `"validate"`. No test asserted the old string; the new one is more accurate.
- **`settings` not yet plumbed** — the context type carries `settings?` but `runProjectValidators` passes only `{ projectRoot }`. No consumer needs settings yet (DL#231 doesn't); wire it when one does.
