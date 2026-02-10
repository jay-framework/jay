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

## Concern 1: Plugin/Contract Model Divergence (HIGH)

**Files:** `editor-protocol/lib/protocol.ts`, `editor-handlers.ts`, `plugin-resolution.ts`

### What happened

| Concept | main | PR branch |
|---------|------|-----------|
| `Plugin` type | `{ manifest: PluginManifest, location: { type, path?, module? } }` — full manifest from compiler-shared | `{ name: string, contracts: Contract[] }` — simplified |
| `ContractSchema` | Present | Replaced by `Contract` (adds `trackBy`, `async`, `phase` on tags) |
| `InstalledApp` | Still present (legacy) | **Removed** |
| `InstalledAppContracts` | Still present | **Removed** |
| `PluginManifest` in protocol | Re-exported from compiler-shared | **Removed** from protocol |
| `ProjectPage.contractSchema` | Present | Renamed to `ProjectPage.contract` |

### Risk

- PR removes `InstalledApp` and `InstalledAppContracts`. Main's `extractHeadlessComponents()` still depends on these.
- Main re-exports `PluginManifest` from compiler-shared into the protocol. PR removes this coupling.
- The two Plugin shapes are incompatible — consumers expecting manifest/location will break with name/contracts.

### Decision needed

> **Q1:** Do we keep InstalledApp as deprecated-but-present, or fully remove it and migrate all consumers?
>
> **Q2:** Which Plugin shape do we use in the protocol? The PR's simplified version is cleaner but loses manifest detail that main's consumers may need.
>
> **Q3:** Do we rename `contractSchema` → `contract` as the PR proposes?

---

## Concern 2: Plugin Resolution Architecture (HIGH)

**File:** `compiler-shared/lib/plugin-resolution.ts`

### What happened

| Aspect | main | PR branch |
|--------|------|-----------|
| `resolveLocalPlugin` / `resolveNpmPlugin` | Exported, inline logic, supports **dynamic contracts** | Refactored to use manifest helpers, made **private**, no dynamic contract support |
| `dynamic_contracts` type | `DynamicContractConfig \| DynamicContractConfig[]` with exported interface | Keeps original inline type |
| New APIs | `findDynamicContract()` | `resolvePluginManifest()`, `resolveLocalPluginManifest()`, `resolveNpmPluginManifest()` |
| `LOCAL_PLUGIN_PATH` | Not exported | Exported as constant |
| `slugs` field | Not present | Added to contract definitions |
| `setup` field | Added (Design Log #87) | Not present |
| Error handling | Improved messages with dynamic contract prefixes (e.g. `list/*`) | Structured `WithValidations<T>` responses |

### Risk

- Main's dynamic contract support (`findDynamicContract`, `DynamicContractConfig[]`) is entirely absent from the PR.
- PR's manifest-only resolution (`resolvePluginManifest`) is absent from main.
- Both branches changed error handling — PR uses structured validation objects, main uses improved error messages.

### Decision needed

> **Q4:** Merge strategy: adopt PR's manifest helpers + port main's dynamic contract logic into the refactored structure? This is significant integration work.

---

## Concern 3: Headless Components vs Vendor System (HIGH)

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

| Location | Issue |
|----------|-------|
| `jay-html-builder.ts` `HeadlessComponent` | `key: string` is **required** |
| `jay-html-builder.ts` lines 205-211 | Only adds components when `comp.plugin && comp.contract && comp.key` |
| `binding-analysis.ts` lines 141-149 | `key = usedComponent.key` — undefined for instance-only |
| `binding-analysis.ts` lines 172-178 | Builds `fullPath` as `[key, ...tagPath]` — produces `"undefined.name"` for instance-only |
| `protocol.ts` `usedComponents[].key` | Typed as `string` (required), should be `string \| undefined` |

### Risk

- Figma export cannot generate instance-only headless component imports
- Binding analysis produces invalid paths (`"undefined.name"`) for instance-only components
- Protocol type mismatch silently loses type safety

### Decision needed

> **Q5:** Fix the vendor system before merge to handle optional `key`? Or document as known limitation and address post-merge?
>
> **Q6:** The vendor system also does not support headless component **props** (Design Log #84). Is this acceptable scope for v1?

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

## Concern 5: editor-handlers.ts Structural Rewrite (MEDIUM)

**File:** `stack-cli/lib/editor-handlers.ts`

### What happened

Main changed only logging (~25 call sites). PR rewrote major sections:

| Function | main | PR |
|----------|------|-----|
| `parseContractFile` | Logging change only | **Replaced** by `loadAndExpandContract()` |
| `resolveLinkedTags` | Logging change only | **Replaced** by `expandContractTags()` |
| `extractHeadlessComponents` | Uses `installedApps` + `installedAppContracts` | **Replaced** by `extractHeadlessComponentsFromJayHtml()` using `parseJayFile` |
| `scanInstalledApps` | Present | **Removed** |
| `scanInstalledAppContracts` | Present | **Removed** |
| `scanPlugins` | Logging change only | **Rewritten** to use `resolvePluginManifest` |
| New: `onExport` | N/A | Handles vendor document export |
| New: `onImport` | N/A | Handles vendor document import |
| New: `pageUrlToDirectoryPath` | N/A | URL → filesystem path conversion |
| New: `convertContractToProtocol` | N/A | Compiler contract → protocol contract |

### Risk

- The PR's version uses `parseJayFile` for headless extraction, which is more correct than main's HTML parsing approach.
- But the PR doesn't have main's `loadPluginContract` or dynamic contract support.
- Merge conflicts will be extensive since both branches touch nearly every function.

### Resolution

Use PR's structural rewrites as the base, then port main's logging and dynamic contract support. This is the highest-effort merge task.

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

## Concern 7: Documentation Overlap (LOW)

**Files:** `jay-html.md`, `building-jay-packages.md`, `README.md`

### What happened

- `jay-html.md`: Main documents instance-based headless and boolean attributes. PR documents contract references, sandbox attribute, and validation. Both edit the headless import section.
- `building-jay-packages.md`: Main documents dynamic contract materialization. PR documents slugs and URL parameters.
- `README.md`: Main adds CLI/testing links. PR adds design tool integration links.

### Resolution

Merge both sets of documentation. The headless import section in `jay-html.md` needs manual reconciliation to cover both key-based, instance-based, and vendor-exported headless imports.

---

## Concern 8: Build/Config Changes (LOW)

**Files:** `.gitignore`, `route-scanner/package.json`, `route-scanner/vite.config.ts`

- `.gitignore`: Main adds `agent-kit`, PR changes `.yarn/install-state.gz` → `.yarn/`. Both are independent.
- `route-scanner`: PR changes output from CJS to ESM (`dist/index.js` → `dist/index.mjs`, `formats: ['es']`). Main has no changes here.

### Decision needed

> **Q7:** Is the route-scanner CJS→ESM change tested? Does it break any consumer that `require()`s it?

---

## Summary: Decision Matrix

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q1 | Keep or remove InstalledApp? | (a) Keep deprecated (b) Remove fully | **(b)** PR's `parseJayFile` approach is more correct; remove InstalledApp and migrate |
| Q2 | Protocol Plugin shape? | (a) Main's full manifest (b) PR's simplified | **(b)** with optional `manifest?: PluginManifest` for consumers that need it |
| Q3 | Rename contractSchema → contract? | (a) Yes (b) No | **(a)** Cleaner name, PR already does it |
| Q4 | Plugin resolution merge strategy? | Manual integration | Adopt PR's manifest helpers, port main's dynamic contract logic into them |
| Q5 | Fix vendor for optional key? | (a) Before merge (b) Post-merge | **(b)** Document as limitation; vendor v1 targets key-based headless only |
| Q6 | Vendor props support? | (a) Before merge (b) Post-merge | **(b)** Acceptable v1 scope limitation |
| Q7 | Route-scanner ESM change? | Verify consumers | Test before merge |

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
