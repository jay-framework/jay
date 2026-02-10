# PR #158 Merge Concerns — `export_import` into `main`

## Background

PR #158 (`export_import` branch) introduces the Figma vendor integration and enhanced plugin resolution. Meanwhile, `main` has evolved significantly since the branch diverged (merge base `df492a19`), adding:

- **Headless component props & repeater support** (Design Log #84, PR #159)
- **Dynamic contracts** (Design Log #80)
- **`jay-stack setup` command** (Design Log #87)
- **Structured logging** (`getLogger()` replacing `console.*`)
- **Dev server test mode** (Design Log #81)
- **Agent kit** (Design Log #85)

**16 files** were modified on both branches. This document catalogs merge concerns, duplicate work, and decisions needed before merging.

---

## Concern 1: Plugin/Contract Model Divergence — RESOLVED

**Files:** `editor-protocol/lib/protocol.ts`, `editor-handlers.ts`, `plugin-resolution.ts`

### What happened

| Concept                      | main                                                                                                    | PR branch                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Plugin` type                | `{ manifest: PluginManifest, location: { type, path?, module? } }` — full manifest from compiler-shared | `{ name: string, contracts: Contract[] }` — simplified            |
| `ContractSchema`             | Present                                                                                                 | Replaced by `Contract` (adds `trackBy`, `async`, `phase` on tags) |
| `InstalledApp`               | Still present (legacy)                                                                                  | **Removed**                                                       |
| `InstalledAppContracts`      | Still present                                                                                           | **Removed**                                                       |
| `PluginManifest` in protocol | Re-exported from compiler-shared                                                                        | **Removed** from protocol                                         |
| `ProjectPage.contractSchema` | Present                                                                                                 | Renamed to `ProjectPage.contract`                                 |

### Decision: Take the PR's approach

Verified that `InstalledApp`, `InstalledAppContracts`, `contractSchema`, and the full `Plugin` type are **only consumed by `editor-handlers.ts`** and the protocol layer itself (definition, constructors, types re-export). No other packages depend on them.

- **Q1:** Remove `InstalledApp` fully (PR's approach)
- **Q2:** Use PR's simplified `Plugin { name, contracts }`
- **Q3:** Rename `contractSchema` → `contract` (PR's approach)

---

## Concern 2: Plugin Resolution Architecture — RESOLVED

**File:** `compiler-shared/lib/plugin-resolution.ts`

### What happened

| Aspect                                    | main                                                                       | PR branch                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `resolveLocalPlugin` / `resolveNpmPlugin` | Exported, inline logic, supports **dynamic contracts**                     | Refactored to use manifest helpers, made **private**, no dynamic contract support       |
| `dynamic_contracts` type                  | `DynamicContractConfig \| DynamicContractConfig[]` with exported interface | Keeps original inline type                                                              |
| New APIs                                  | `findDynamicContract()`                                                    | `resolvePluginManifest()`, `resolveLocalPluginManifest()`, `resolveNpmPluginManifest()` |
| `LOCAL_PLUGIN_PATH`                       | Not exported                                                               | Exported as constant                                                                    |
| `slugs` field on PluginManifest           | Not present                                                                | Added to contract definitions in plugin.yaml                                            |
| `params` field on Contract                | Added (Design Log #85)                                                     | Not present                                                                             |
| `setup` field on PluginManifest           | Added (Design Log #87)                                                     | Not present                                                                             |
| Error handling                            | Improved messages with dynamic contract prefixes (e.g. `list/*`)           | Structured `WithValidations<T>` responses                                               |

### Decision

**Resolution structure:** Take the PR's approach for `resolveLocalPlugin`/`resolveNpmPlugin` refactoring. Verify no logic fixes from main are lost in the plugin.yaml loading path.

**APIs:** Keep both sets of new APIs:

- PR: `resolvePluginManifest()`, `resolveLocalPluginManifest()`, `resolveNpmPluginManifest()`
- Main: `findDynamicContract()`

**Preserve from main:**

- `DynamicContractConfig` interface and `DynamicContractConfig | DynamicContractConfig[]` type on manifest
- `setup` field on PluginManifest (Design Log #87)
- Dynamic contract resolution logic (port into PR's refactored helpers)

**Preserve from PR:**

- `LOCAL_PLUGIN_PATH` exported constant
- Manifest-only resolution helpers

**Drop from PR:**

- `slugs` field on PluginManifest contracts — main uses `params` on the Contract file itself (Design Log #85), which is the chosen approach. Params live in the `.jay-contract` file, not in `plugin.yaml`.
- Remove `slugs` validation from `validate-plugin.ts` as well.

**Error handling:** Both branches already use `WithValidations<T>`, so merging error handling is straightforward — combine main's improved error messages (with dynamic contract prefixes) with PR's structured validation responses.

---

## Concern 3: Headless Components vs Vendor System — RESOLVED

**Files:** `jay-html-builder.ts`, `binding-analysis.ts`, `protocol.ts`

### What happened

Main introduced instance-only headless components (Design Log #84):

```html
<!-- Instance-only: no key, used via <jay:product-card> -->
<script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
<jay:product-card productId="prod-123">
  <h1>{name}</h1>
</jay:product-card>
```

The PR's vendor system assumes **all headless components have a `key`**:

| Location                                  | Issue                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `jay-html-builder.ts` `HeadlessComponent` | `key: string` is **required**                                                            |
| `jay-html-builder.ts` lines 205-211       | Only adds components when `comp.plugin && comp.contract && comp.key`                     |
| `binding-analysis.ts` lines 141-149       | `key = usedComponent.key` — undefined for instance-only                                  |
| `binding-analysis.ts` lines 172-178       | Builds `fullPath` as `[key, ...tagPath]` — produces `"undefined.name"` for instance-only |
| `protocol.ts` `usedComponents[].key`      | Typed as `string` (required), should be `string \| undefined`                            |

### Decision: Known limitation — filter out, don't break

This is **not a technical bug to fix now**. The PR does not handle nested (instance-only) headless components because:

- We don't yet know how this support should look on the design-tool side of the editor protocol (e.g., how Figma represents a `<jay:product-card>` instance with props)
- The product-level design for headless components in design tools needs to come first

**For the merge:**

- The vendor system should **filter out** or **ignore** instance-only headless components (without `key`) rather than producing invalid output like `"undefined.name"`
- Make `usedComponents[].key` optional (`string | undefined`) in the protocol types for correctness
- Document as a known missing feature: "Vendor export does not yet support instance-only headless components (`<jay:xxx>` without `key`). Requires design for how design tools represent headless component instances and props."

**Not blocking merge.** Key-based headless components (the pre-Design Log #84 model) remain fully supported.

---

## Concern 4: Logging Migration (MEDIUM)

**Files:** `editor-handlers.ts`, `editor-server.ts`, `connection-manager.ts`, `server.ts`

### What happened

Main migrated all `console.*` calls to `getLogger()` from `@jay-framework/logger`. The PR still uses `console.*` throughout.

### Affected areas

- `editor-handlers.ts` — ~25 call sites on main now use logger; PR rewrites the file with `console.*`
- `editor-server.ts` — main uses logger; PR adds new export/import handlers with `console.*`
- `connection-manager.ts` — main uses logger; PR adds types but keeps `console.*`
- `server.ts` — main uses `log.important()`; PR uses `console.log` for vendor registration

### Resolution

Straightforward but tedious: after merging PR's structural changes, replace all `console.*` with `getLogger().*`. No decision needed, just execution.

---

## Concern 5: editor-handlers.ts Structural Rewrite — RESOLVED

**File:** `stack-cli/lib/editor-handlers.ts`

### What happened

Main changed only logging (~25 call sites). PR rewrote major sections:

| Function                         | main                                           | PR                                                                            |
| -------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `parseContractFile`              | Logging change only                            | **Replaced** by `loadAndExpandContract()`                                     |
| `resolveLinkedTags`              | Logging change only                            | **Replaced** by `expandContractTags()`                                        |
| `extractHeadlessComponents`      | Uses `installedApps` + `installedAppContracts` | **Replaced** by `extractHeadlessComponentsFromJayHtml()` using `parseJayFile` |
| `scanInstalledApps`              | Present                                        | **Removed**                                                                   |
| `scanInstalledAppContracts`      | Present                                        | **Removed**                                                                   |
| `scanPlugins`                    | Logging change only                            | **Rewritten** to use `resolvePluginManifest`                                  |
| New: `onExport`                  | N/A                                            | Handles vendor document export                                                |
| New: `onImport`                  | N/A                                            | Handles vendor document import                                                |
| New: `pageUrlToDirectoryPath`    | N/A                                            | URL → filesystem path conversion                                              |
| New: `convertContractToProtocol` | N/A                                            | Compiler contract → protocol contract                                         |

### Decision: Take the PR's approach

The PR's structural rewrites are the base. The PR's `parseJayFile`-based headless extraction is more correct than main's HTML parsing. What still needs porting from main into the PR's code:

- Replace all `console.*` with `getLogger().*`
- Port dynamic contract support into the rewritten `scanPlugins`

---

## Concern 6: Test Mock Compatibility (LOW)

**Files:** `contract-compiler.test.ts`, `parse-jay-file.unit.test.ts`

### What happened

Both branches add new methods to the mock `JayImportResolver`:

- Main adds `loadPluginContract` stubs
- PR adds `resolvePluginManifest` stubs

### Resolution

Include both stubs in the merged mock objects. Low effort, no decisions needed.

---

## Concern 7: Documentation Overlap — RESOLVED

**Files:** `jay-html.md`, `building-jay-packages.md`, `README.md`

### What happened

- `jay-html.md`: Main documents instance-based headless and boolean attributes. PR documents contract references, sandbox attribute, and validation. Both edit the headless import section.
- `building-jay-packages.md`: Main documents dynamic contract materialization. PR documents slugs and URL parameters.
- `README.md`: Main adds CLI/testing links. PR adds design tool integration links.

### Decision

- Reconcile all docs — merge both sets of documentation.
- `jay-html.md` headless section: merge to cover key-based, instance-based, and vendor-exported headless imports.
- `building-jay-packages.md`: PR's `slugs` documentation must be replaced with main's `params` approach (params live in the `.jay-contract` file, not `plugin.yaml`). Update examples accordingly.
- `README.md`: merge both sets of links (different sections, low conflict).

---

## Concern 8: Build/Config Changes — RESOLVED

**Files:** `.gitignore`, `route-scanner/package.json`, `route-scanner/vite.config.ts`

- `.gitignore`: Main adds `agent-kit`, PR changes `.yarn/install-state.gz` → `.yarn/`. Both are independent — keep both.
- `route-scanner`: PR changes output from CJS to ESM (`dist/index.js` → `dist/index.mjs`, `formats: ['es']`). Main has no changes here.

### Decision

Accept the ESM change. Verify the dev server works after the switch (route-scanner is used during route scanning at dev time). If the dev server starts and routes resolve correctly, the change is safe.

---

## Summary: Decision Matrix

| #   | Question                          | Options                                      | Decision                                                                                                                                                                    |
| --- | --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Keep or remove InstalledApp?      | (a) Keep deprecated (b) Remove fully         | **DECIDED: (b)** Remove fully. Only used by editor-handlers (+ protocol definition). PR's `parseJayFile` approach is more correct.                                          |
| Q2  | Protocol Plugin shape?            | (a) Main's full manifest (b) PR's simplified | **DECIDED: (b)** PR's `{ name, contracts }`. editor-handlers is the sole consumer of the protocol Plugin type.                                                              |
| Q3  | Rename contractSchema → contract? | (a) Yes (b) No                               | **DECIDED: (a)** Only used in editor-handlers + protocol + test. PR's rename is clean.                                                                                      |
| Q4  | Plugin resolution merge strategy? | Manual integration                           | **DECIDED:** PR's refactored structure + main's dynamic contracts + both API sets. Drop PR's `slugs` (use main's `params` in contract file).                                |
| Q5  | Fix vendor for optional key?      | (a) Before merge (b) Post-merge              | **DECIDED:** Filter out instance-only headless (no `key`) in vendor code. Make `usedComponents[].key` optional. Document as known limitation pending design-tool UX design. |
| Q6  | Vendor props support?             | (a) Before merge (b) Post-merge              | **DECIDED:** Not in scope. We need product-level design for how design tools represent headless instances + props before implementing.                                      |
| Q7  | Route-scanner ESM change?         | Verify consumers                             | **DECIDED:** Accept ESM. Verify dev server works with the change.                                                                                                           |

### Guiding principle

> **For editor-handlers.ts and anything only consumed by it, the PR's approach wins.**
>
> Verified scope: `InstalledApp`, `InstalledAppContracts`, `contractSchema`, `scanInstalledApps`, `scanInstalledAppContracts`, `extractHeadlessComponents`, `resolveLinkedTags`, `parseContractFile` — all exclusively used within editor-handlers.ts and its protocol definitions. No other packages depend on them. The PR's replacements (`extractHeadlessComponentsFromJayHtml`, `loadAndExpandContract`, `expandContractTags`, simplified `Plugin`/`Contract`, `onExport`/`onImport`) are adopted directly.
>
> What still needs porting from main into the PR's structure:
>
> - `getLogger()` logging (replace `console.*`)
> - Dynamic contract support in `scanPlugins` / plugin resolution
> - Dev server test mode in `server.ts`
> - Agent kit support

---

## Merge Plan (Proposed Order)

### Phase 1: Foundation (plugin-resolution.ts)

1. Adopt PR's manifest helpers and `WithValidations` error handling
2. Port main's `DynamicContractConfig`, `findDynamicContract()`, and `setup` field
3. Keep `LOCAL_PLUGIN_PATH` export and `slugs` from PR
4. Run plugin-resolution tests

### Phase 2: Protocol (protocol.ts)

1. Use PR's simplified `Plugin` and `Contract` types
2. Remove `InstalledApp` and `InstalledAppContracts`
3. Add PR's `ExportMessage`, `ImportMessage`, `ExportResponse`, `ImportResponse`
4. Keep main's re-exports where needed for internal use
5. Make `usedComponents[].key` optional (`string | undefined`)

### Phase 3: Editor Handlers (editor-handlers.ts)

1. Use PR's structural rewrites as base
2. Replace all `console.*` with `getLogger().*`
3. Port main's dynamic contract support into `scanPlugins`
4. Add PR's `onExport` and `onImport` handlers
5. Run editor-handler tests

### Phase 4: Compiler & Tests

1. Merge `jay-html-parser.ts` changes (both headless and import detection)
2. Merge `jay-import-resolver.ts` (both `loadPluginContract` and `resolvePluginManifest`)
3. Update test mocks to include both new resolver methods
4. Run full test suite

### Phase 5: Server, Client, Docs

1. Merge `server.ts` (test mode + vendor registration + logger)
2. Merge `editor-server.ts` (logger + export/import handlers)
3. Merge `connection-manager.ts` (logger + message types)
4. Merge documentation files
5. Merge `.gitignore`

### Phase 6: Verification

1. Run full test suite
2. Manual test with `jay dev` in fake-shop
3. Verify vendor registration log message
4. Build all packages

---

## Verification Criteria

- [ ] All existing tests pass (no regressions from main)
- [ ] All PR tests pass (vendor, plugin-resolution, editor-handlers)
- [ ] Dynamic contracts still work (main's feature)
- [ ] Headless component props and instances still work (main's feature)
- [ ] Figma vendor export works for key-based headless components
- [ ] `getLogger()` used everywhere (no `console.*` in production code)
- [ ] `jay-stack setup` command still works (main's feature)
- [ ] Dev server test mode still works (main's feature)
- [ ] Agent kit still works (main's feature)
- [ ] No TypeScript compilation errors
