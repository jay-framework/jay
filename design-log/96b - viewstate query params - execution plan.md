# ViewState Query Params — Execution Plan

> Companion to System Design (96a). This document is the step-by-step plan for the engineering team.

---

## Guiding Principles

- **Minimize changes.** This feature touches 5 files (2 new, 3 modified — one is a single-line re-export). Keep it that way.
- **Maximize gain.** Each phase delivers working, demo-able functionality.
- **Clean code.** Pure functions, single responsibility, no side effects in the core logic.
- **Test-first.** Write tests before or alongside implementation. No false greens — write the correct expected output, let tests fail, then make them pass.
- **Non-breaking.** Zero changes to the normal request path when no `vs.*` params are present.

---

## Phase Overview

| Phase | Deliverable | Demo? | Estimated effort |
|-------|-------------|-------|-----------------|
| 1 | Core pure functions + unit tests | No | Medium |
| 2 | Dev server integration (string overrides) | **DEMO 1** | Small |
| 3 | Contract-based type coercion | **DEMO 2** | Small |
| 4 | Preview mode (banner + disabled interactions) | **DEMO 3** | Small |
| 5 | Arrays, JSON, headless components | **DEMO 4** | Medium |

---

## Phase 1: Core Pure Functions + Unit Tests

**Goal:** Build and test all pure logic with zero dev-server changes.

### Tasks

0. **Prerequisite:** Re-export `camelCase` from `compiler-jay-html/lib/index.ts`:
   ```typescript
   export { camelCase } from './case-utils';
   ```
   This is needed by `findContractTag`. One line, non-breaking. Run `yarn build` in `compiler-jay-html` to verify.

1. **Create** `packages/jay-stack/dev-server/lib/viewstate-query-params.ts`
2. **Implement** these functions (see System Design 96a for signatures):
   - `extractViewStateParams(query)` — filter `vs.*` keys, strip prefix, last-wins
   - `isPathSafe(segments)` — blocklist check
   - `setNestedValue(obj, path, value)` — deep set with array auto-creation
   - `coerceValue(rawValue, tag)` — return `CoerceResult`. **Important:** All primitive types (`string`, `number`, `boolean`, `Date`) have `kind = JayTypeKind.atomic`. Use `isAtomicType(dataType)` then switch on `dataType.name`. Note: date is `'Date'` (capital D).
   - `findContractTag(path, contract, headlessContracts)` — contract tag tree walk with camelCase comparison
   - `applyViewStateOverrides(viewState, overrides, contract, headlessContracts)` — orchestration
3. **Create** `packages/jay-stack/dev-server/test/viewstate-query-params.test.ts`
4. **Write unit tests** for every function:

| Function | Test cases |
|----------|-----------|
| `extractViewStateParams` | No vs params → `undefined`; mixed params → only vs extracted; repeated params → last wins; array values → last element |
| `isPathSafe` | Normal paths → `true`; `__proto__` / `constructor` / `prototype` → `false`; nested blocked segment → `false` |
| `setNestedValue` | Flat key; nested key; auto-create intermediate objects; numeric index → array; array holes filled with `{}`; deeply nested |
| `coerceValue` | String as-is; number valid/invalid; boolean true/false/invalid; date valid/invalid → ISO string (note: `'Date'` capital D in `JayAtomicType.name`); enum by name/by index/invalid/out-of-range/non-integer/negative; JSON array/object/invalid. All use `isAtomicType` → `name` switch, NOT `kind` switch |
| `findContractTag` | Direct tag match; camelCase match ("product type" → productType); nested tags; headless key match; numeric segment skips into sub-contract; missing path → `undefined` |
| `applyViewStateOverrides` | String override; type-coerced override; failed coercion → original preserved; blocked path → skipped; JSON then dot-path precedence |

### Run tests

```bash
cd packages/jay-stack/dev-server
yarn vitest run test/viewstate-query-params.test.ts
```

**Exit criteria:** All unit tests pass. No dev-server changes yet.

---

## Phase 2: Dev Server Integration (String Overrides)

**Goal:** Wire the override logic into the dev server. String overrides work end-to-end.

### Tasks

1. **In `mkRoute`** (`dev-server/lib/dev-server.ts`):
   - Import `extractViewStateParams` from `./viewstate-query-params`
   - After building `pageParams`, call `extractViewStateParams(req.query)`
   - If result is defined, force `handleDirectRequest` (bypass cache logic), passing `vsParams`

2. **In `handleDirectRequest`**:
   - Add optional parameter: `vsParams?: Record<string, string>`
   - After the ViewState merge step (where `renderedSlowly` and `renderedFast` are merged), add:
     ```typescript
     if (vsParams) {
         viewState = applyViewStateOverrides(viewState, vsParams);
     }
     ```
   - Note: No contract passed yet — all overrides applied as strings. This is correct behavior for string fields and sufficient for Demo 1.

3. **In the `sendResponse` call**: no changes yet (preview mode comes in Phase 4).

### Run tests

```bash
cd packages/jay-stack/dev-server
yarn vitest run
```

Verify existing dev-server tests still pass (no regressions).

---

### DEMO 1: "Override any text on the page"

> **Audience:** Management team
> **Duration:** 2 minutes
> **Message:** "We can now override any text on any Jay page directly from the URL."

**Setup:** Start any Jay project dev server (`yarn dev`).

**Script:**
1. Open a page in the browser normally — show default data
2. Add `?vs.title=Hello+Management` to the URL — title changes to "Hello Management"
3. Add `&vs.subtitle=Live+Demo` — subtitle also changes
4. Remove the query params — page returns to normal data
5. Show a different page with different fields — same mechanism works everywhere

**Key point to emphasize:** No code changes needed. Any field, any page, just a URL.

---

## Phase 3: Contract-Based Type Coercion

**Goal:** Numbers, booleans, dates, and enums coerce to the correct types instead of remaining strings.

### Tasks

1. **In `handleDirectRequest`** (when `vsParams` is present):
   - **Page contract:** Load via `fs.readFile` on the `.jay-contract` file (same path as `.jay-html` with extension swap) → `parseContract()` → `checkValidationErrors()`. Wrap in try/catch — return `undefined` if file doesn't exist.
   - **Headless contracts:** Add `headlessContracts` to the existing destructuring of `pagePartsResult.val` (currently only destructures `parts`, `serverTrackByMap`, `clientTrackByMap`, `usedPackages`). The field is `headlessContracts: HeadlessContractInfo[]` — it's already populated by `loadPageParts`.
   - Pass both to `applyViewStateOverrides`:
     ```typescript
     const { parts: pageParts, serverTrackByMap, clientTrackByMap, usedPackages, headlessContracts } = pagePartsResult.val;
     // ... later, after ViewState merge:
     if (vsParams) {
         const contract = await loadPageContract(route.jayHtmlPath);
         viewState = applyViewStateOverrides(viewState, vsParams, contract, headlessContracts);
     }
     ```
   - Create a small helper `loadPageContract(jayHtmlPath)` that reads the `.jay-contract` file and returns `Contract | undefined` (graceful if no contract file exists)

2. **Add a warning log** when coercion fails — use `getDevLogger()` pattern consistent with Design Log #83.

### Notes

- The `coerceValue` function was already implemented and tested in Phase 1. This phase just connects it to real contract data.
- Keep `loadPageContract` simple — just `fs.readFile` + `parseContract` + `checkValidationErrors`. Catch errors and return `undefined`.
- No mapping or adapting needed for `headlessContracts` — `loadPageParts` already returns `HeadlessContractInfo[]` (the same type `findContractTag` expects).

### Run tests

```bash
cd packages/jay-stack/dev-server
yarn vitest run
```

---

### DEMO 2: "Smart type coercion from the URL"

> **Audience:** Management team
> **Duration:** 3 minutes
> **Message:** "The system understands data types. Numbers are numbers, booleans are booleans — the URL just works."

**Setup:** Use a Jay project that has a page with numeric, boolean, and ideally enum fields.

**Script:**
1. Open a product page normally — show real data
2. Override price: `?vs.price=1.99` — price updates (it's a real number, not a string)
3. Override stock status: `&vs.inStock=false` — "In Stock" indicator disappears (boolean, not string "false")
4. If the page has an enum variant: `&vs.productType=digital` — correct variant activates
5. Show an intentional bad value: `&vs.price=not-a-number` — price stays at original value (graceful failure). Show the terminal — warning is logged.
6. Explain: "The system reads the contract and knows the types. Bad values are safely ignored."

---

## Phase 4: Preview Mode

**Goal:** Visual indicator and safety — prevent real actions with mock data.

### Tasks

1. **In `generateClientScript`** (`stack-server-runtime/lib/generate-client-script.ts`):
   - Add `previewMode?: boolean` to `GenerateClientScriptOptions`
   - Destructure it: `const { enableAutomation = true, slowViewState, previewMode } = options;`
   - When `previewMode` is true, override the **local** `compositeParts` variable (line ~44) to `'[]'`. This variable is a string built from the `parts` parameter — it controls whether client-side event handlers mount. The `parts` parameter stays unchanged.
   - Inject at the top of the HTML body:
     ```html
     <div style="position:fixed;top:0;left:0;right:0;z-index:99999;
         background:#f59e0b;color:#000;text-align:center;padding:6px 12px;
         font-family:system-ui;font-size:13px;font-weight:500;">
         ⚠ ViewState Preview Mode — interactions disabled
     </div>
     ```
   - Inject CSS: `<style>[ref]{pointer-events:none;opacity:0.6;}</style>`

2. **In `sendResponse`** (`dev-server/lib/dev-server.ts`, line ~783):
   - Add `previewMode?: boolean` as the last parameter
   - Pass it through to the `GenerateClientScriptOptions` object (line ~807): `{ enableAutomation: !options.disableAutomation, slowViewState, previewMode }`

3. **In `handleDirectRequest`** — update the `sendResponse` call:
   - Pass `!!vsParams` as the new `previewMode` argument (last position)
   - The other caller (`handleCachedRequest`) passes `undefined` — no change needed there

### Run tests

```bash
# Both packages
cd packages/jay-stack/dev-server && yarn vitest run
cd packages/jay-stack/stack-server-runtime && yarn vitest run
```

Update or add a test in `stack-server-runtime` that verifies `previewMode: true` produces the banner HTML and omits composite parts.

---

### DEMO 3: "Safe preview with visual indicator"

> **Audience:** Management team
> **Duration:** 2 minutes
> **Message:** "When previewing with custom data, the system prevents any real actions and clearly shows you're in preview mode."

**Script:**
1. Open a page with overrides: `?vs.title=Preview+Demo&vs.price=0`
2. Point out the yellow banner: "ViewState Preview Mode — interactions disabled"
3. Try clicking a button (Add to Cart, Submit, etc.) — nothing happens
4. Show that buttons/interactive elements appear dimmed
5. Remove query params — banner disappears, interactions work normally
6. Explain: "This prevents accidentally triggering real backend actions with fake data."

---

## Phase 5: Arrays, JSON, and Headless Components

**Goal:** Complete feature set — arrays, JSON replacement, nested headless component paths.

### Tasks

1. **Verify array support** — should already work from Phase 1's `setNestedValue` (numeric path segments create arrays). Add integration-level tests:
   - `vs.products.0.name=Shirt&vs.products.1.name=Pants` on a page with a products list
   - Verify array creation from empty state
   - Verify array hole filling

2. **Verify JSON replacement** — should already work from Phase 1's `coerceValue` (JSON detection). Add tests:
   - `vs.products=[{"name":"A"},{"name":"B"}]` replaces entire array
   - `vs.priceData={"currency":"USD","amount":42}` replaces entire object
   - Mixed: JSON replacement then dot-path override

3. **Verify headless component support** — key-based headless components should work through dot-path (`vs.product.name=Foo` sets `viewState.product.name`). Add a test with headless contract info to verify `findContractTag` resolves the correct type.

4. **Add integration test** (optional but recommended):
   - Use the dev server test mode pattern (see `examples/jay-stack/fake-shop/test/smoke.test.ts`)
   - Start server, request page with `vs.*` params via `fetch`, verify response contains overridden values and preview banner

### Run tests

```bash
cd packages/jay-stack/dev-server
yarn vitest run
```

---

### DEMO 4: "Full feature demo on any Jay project"

> **Audience:** Management team
> **Duration:** 5 minutes
> **Message:** "This works on any Jay project. Let me show you the full power."

**Setup:** Pick 2-3 different Jay projects that use different framework features (simple pages, headless components, lists, variants).

**Script:**

**Part A — List/Array override:**
1. Open a page with a product list
2. `?vs.products=[{"name":"Demo Item 1","price":10},{"name":"Demo Item 2","price":20}]` — entire list replaced
3. Tweak one item: add `&vs.products.0.name=Modified+Item` — first item's name changes

**Part B — Headless component override:**
1. Open a page that uses a headless component (e.g., product detail with `key="product"`)
2. `?vs.product.name=Custom+Product&vs.product.price=99.99` — headless component data overridden

**Part C — Different project:**
1. Switch to a completely different Jay project
2. Override fields on a page — works immediately with no setup
3. Explain: "This is a framework feature. Any page, any project, any data."

**Part D — Edge cases (brief):**
1. Show empty list → populated: `?vs.items.0.name=First+Item`
2. Show variant toggle: `?vs.isLoading=true` → loading state appears
3. Show preview banner is always there when overriding

---

## Testing Checklist

### Unit Tests (Phase 1)

All tests in `packages/jay-stack/dev-server/test/viewstate-query-params.test.ts`:

- [ ] `extractViewStateParams` — 4+ test cases
- [ ] `isPathSafe` — 4+ test cases
- [ ] `coerceValue` — 12+ test cases (every type + failure mode)
- [ ] `setNestedValue` — 6+ test cases
- [ ] `findContractTag` — 5+ test cases
- [ ] `applyViewStateOverrides` — 5+ test cases

### Regression Tests (Phase 2+)

- [ ] Existing `dev-server.test.ts` tests pass unchanged
- [ ] Existing `action-router.test.ts` tests pass unchanged

### Manual Verification (each demo)

- [ ] Page without `vs.*` params behaves identically to before
- [ ] Page with `vs.*` params shows overridden values
- [ ] Preview banner appears when overrides are active
- [ ] Interactive elements are disabled in preview mode
- [ ] Console/terminal warnings appear for coercion failures

---

## Code Quality Guidelines

1. **One new file only.** All override logic goes in `viewstate-query-params.ts`. Do not scatter logic across existing files.
2. **Pure functions.** Every function in the new file is pure (no I/O, no globals). The only I/O is in the dev-server integration (reading the contract file).
3. **Export what's needed, keep the rest private.** Only export `extractViewStateParams` and `applyViewStateOverrides` from the module. The rest are implementation details (export only for testing if needed).
4. **Type safety.** Use the framework's existing types (`Contract`, `ContractTag`, `JayType`, `JayEnumType`). No `any`.
5. **No unnecessary refactoring.** Touch only the files listed in the system design. If you see something to improve elsewhere, note it, don't fix it.
6. **Test naming.** Use descriptive test names that read as specifications: `"returns undefined when no vs params present"`, `"coerces 'true' to boolean true for boolean fields"`.
7. **Warnings, not errors.** Every failure is non-fatal. The page must always render.

---

## File Summary

| File | Action | Phase |
|------|--------|-------|
| `compiler-jay-html/lib/index.ts` | **Modify** (1 line: re-export `camelCase`) | 1 (prerequisite) |
| `dev-server/lib/viewstate-query-params.ts` | **Create** | 1 |
| `dev-server/test/viewstate-query-params.test.ts` | **Create** | 1 |
| `dev-server/lib/dev-server.ts` | **Modify** (4 small changes: extract params, force direct, apply overrides, pass previewMode) | 2, 3, 4 |
| `stack-server-runtime/lib/generate-client-script.ts` | **Modify** (1 option + conditional logic for preview mode) | 4 |

Total: **2 new files, 3 modified files.** That's it.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Import paths don't resolve | Prerequisite step (Phase 1) re-exports `camelCase` from `compiler-jay-html`. Run `yarn build` in that package first. All other imports (`Contract`, `parseContract`, `HeadlessContractInfo`) are already in the main index. |
| Contract file doesn't exist for a page | `loadPageContract` returns `undefined` gracefully; overrides still work as strings |
| Performance impact on normal requests | Zero impact — `extractViewStateParams` returns `undefined` immediately, normal path unchanged |
| Headless contract info shape mismatch | Confirmed: `loadPageParts` returns `headlessContracts: HeadlessContractInfo[]` directly — same type used by `findContractTag`. No adapter needed. |
| `yarn build` fails after changes | Run `yarn build` after each phase to catch cross-package issues early |

---

## Quick Reference: Demo Schedule

| Demo | After Phase | Title | Duration |
|------|-------------|-------|----------|
| **DEMO 1** | Phase 2 | Override any text on the page | 2 min |
| **DEMO 2** | Phase 3 | Smart type coercion from the URL | 3 min |
| **DEMO 3** | Phase 4 | Safe preview with visual indicator | 2 min |
| **DEMO 4** | Phase 5 | Full feature demo on any Jay project | 5 min |

Each demo builds on the previous one. Every demo is independently valuable and shows clear progress to management.

---

## Implementation Notes

### Phase 4: Preview Banner Removed

The original Phase 4 design included a yellow preview banner (`⚠ ViewState Preview Mode`) and CSS (`pointer-events:none; opacity:0.6`) injected into the HTML output. These were **removed** because:

- The rendered HTML from the dev server will be used downstream for **style calculation and Figma import**
- Injecting a banner `<div>` and `<style>` tag into the HTML would pollute the output and be imported into Figma as actual page content
- The banner is purely cosmetic — the functional part (disabling interactive components via `compositeParts = []`) is retained

**What remains:** `previewMode: true` still disables interactive components by passing an empty `compositeParts` array to the client script. This prevents real actions with mock data without polluting the HTML.
