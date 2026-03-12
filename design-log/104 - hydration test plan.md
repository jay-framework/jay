# Design Log #104 — Hydration Test Plan

## Background

Dev server tests now support running generated client scripts in JSDOM (see `run-script-in-jsdom.ts`). This test plan defines coverage for hydration across template constructs and headless component placement.

### Related Design Logs

- #93 — Client hydration (coordinate system, element bridge)
- #99 — Hydration coordinate alignment bugs
- #100 — Hydrate conditional creation fallback
- #102 — Headless instance SSR and hydration compilation
- #84 — Headless component props and repeater support

---

## Test Plan Overview

| Category | Scope | Validation |
|----------|-------|------------|
| 1. Static elements | Plain HTML, no dynamic content | Rendering |
| 2. Conditionals | `{if}` / `{else}` branches | Rendering, interactivity |
| 3. forEach | Client-side iteration | Rendering, interactivity |
| 4. slowForEach | Server-rendered iteration | Rendering, interactivity |
| 5. Headless components | slow, fast, interactive phases | Rendering, interactivity |
| 6. Validation | All cases | Rendering + interactivity |

---

## 1. Static Elements

**Goal:** Verify static HTML hydrates without errors and remains intact.

| Test | Setup | Assert |
|------|-------|--------|
| 1.1 | Page with only static text and markup | DOM matches SSR HTML; no hydration errors |
| 1.2 | Static elements with refs (no bindings) | Refs resolve to correct DOM nodes |
| 1.3 | Nested static structure | Full tree preserved; coordinates correct |

**Fixtures:** `page-static-only`, `page-static-with-refs`

---

## 2. Conditionals

**Goal:** Verify conditional branches hydrate and update correctly.

| Test | Setup | Assert |
|------|-------|--------|
| 2.1 | `{if true}` — branch visible | Rendered content present |
| 2.2 | `{if false}` — branch hidden | Rendered content absent |
| 2.3 | Toggle condition (interactive) | DOM updates when condition changes |
| 2.4 | `{else}` branch | Correct branch visible; switch works |
| 2.5 | Nested conditionals | Inner/outer both hydrate and update |

**Fixtures:** `page-conditional-true`, `page-conditional-false`, `page-conditional-toggle`

---

## 3. forEach

**Goal:** Verify client-side iteration hydrates and reacts to array changes.

| Test | Setup | Assert |
|------|-------|--------|
| 3.1 | forEach with static items | All items rendered; coordinates per item |
| 3.2 | forEach with dynamic text per item | Text bindings work |
| 3.3 | Add/remove items (interactive) | DOM updates; trackBy preserved |
| 3.4 | Reorder items | Order updates correctly |
| 3.5 | Empty array | No items; no errors |

**Fixtures:** `page-foreach-static`, `page-foreach-dynamic`, `page-foreach-empty`

---

## 4. slowForEach

**Goal:** Verify server-rendered iteration hydrates with correct viewState/carryForward.

| Test | Setup | Assert |
|------|-------|--------|
| 4.1 | slowForEach with items | SSR HTML present; hydration succeeds |
| 4.2 | Per-item viewState | Each item has correct data |
| 4.3 | Per-item carryForward | carryForwards resolve (full key + suffix fallback) |
| 4.4 | Interactive updates within items | Updates work post-hydration |
| 4.5 | Empty slowForEach | No items; no errors |

**Fixtures:** `page-slow-foreach`, `page-slow-foreach-empty`

---

## 5. Headless Components

**Goal:** Verify headless instances hydrate in all placements and phases.

### 5a. Static placement

| Test | Setup | Assert |
|------|-------|--------|
| 5a.1 | Slow-only headless (static) | Renders; no client script for instance |
| 5a.2 | Fast headless (static) | viewState from fast; renders |
| 5a.3 | Interactive headless (static) | Renders; refs work; actions work |

### 5b. Under condition

| Test | Setup | Assert |
|------|-------|--------|
| 5b.1 | Headless in `{if true}` | Instance rendered |
| 5b.2 | Headless in `{if false}` | Instance not in DOM |
| 5b.3 | Toggle condition with headless | Instance appears/disappears; no stale refs |

### 5c. Under forEach

| Test | Setup | Assert |
|------|-------|--------|
| 5c.1 | Headless per forEach item | Each item has own instance |
| 5c.2 | Props passed to headless | productId, etc. received correctly |
| 5c.3 | Add/remove items | Instances sync; no orphan refs |

### 5d. Under slowForEach

| Test | Setup | Assert |
|------|-------|--------|
| 5d.1 | Headless per slowForEach item | Each item has instance; carryForward per item |
| 5d.2 | Props from slow phase | productId from template; viewState correct |
| 5d.3 | Mixed: static + slowForEach headless | Both receive correct data |
| 5d.4 | Interactive updates in slowForEach headless | Updates work; carryForward lookup works |

**Fixtures:** `page-headless-static-*`, `page-headless-conditional`, `page-headless-foreach`, `page-headless-slow-foreach`, `page-headless-mixed`

---

## 6. Validation

### 6e. Validate rendering

For each test case above:

- [ ] SSR HTML contains expected structure
- [ ] Hydration completes without errors
- [ ] DOM after hydration matches expected content
- [ ] Coordinates (`jay-coordinate`) present and correct
- [ ] viewState / fastCarryForward / trackByMap parsed and applied

### 6f. Validate interactivity

For cases with interactive behavior:

- [ ] Signal updates reflect in DOM
- [ ] Conditional toggles update DOM
- [ ] forEach add/remove/reorder updates DOM
- [ ] Ref callbacks fire; refs point to correct elements
- [ ] Headless actions (if any) execute correctly

---

## Implementation Notes

### Test infrastructure

- Use `runHydrateScriptInJsdom` for hydrate-based pages (SSR)
- Extend for `makeCompositeJayComponent` pages (client-only) if needed
- Fixtures live in `packages/jay-stack/dev-server/test/fixtures/hydration/`

### Fixture structure

```
fixtures/hydration/
├── page-static-only/
├── page-conditional-true/
├── page-foreach-static/
├── page-slow-foreach/
├── page-headless-static-slow/
├── page-headless-static-fast/
├── page-headless-static-interactive/
├── page-headless-conditional/
├── page-headless-foreach/
├── page-headless-slow-foreach/
└── page-headless-mixed/
```

### Execution order

1. Implement fixtures (jay-html + contracts)
2. Add unit tests per category (1 → 5)
3. Add rendering assertions (6e)
4. Add interactivity assertions (6f) where applicable

---

## Verification Criteria

- All tests pass in `packages/jay-stack/dev-server`
- No regressions in existing dev-server tests
- Coverage for: static, conditional, forEach, slowForEach, headless (a–d)
- Both rendering and interactivity validated where relevant
