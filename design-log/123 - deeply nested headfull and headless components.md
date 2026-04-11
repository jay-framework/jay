# Design Log #123: Deeply Nested Headfull and Headless Components

## Background

DL#111 introduced headfull full-stack components — components that bring their own jay-html template and participate in three-phase rendering (slow/fast/interactive). The implementation reuses the headless instance pipeline by injecting the headfull component's template body into matching `<jay:Name>` tags at parse time. After injection, the component is compiled identically to a headless instance.

This works well for single-level usage: a page imports a headfull FS component and uses it. But real applications need deeper composition — a layout component containing a header, a header containing a cart indicator, or a page-level keyed headless whose data flows into a headfull component's template.

This design log analyzes three nesting scenarios that are currently unsupported or broken, with concrete examples of what fails and why.

## Related Design Logs

- **DL#84** — Headless component props and repeater support (`<jay:xxx>` syntax)
- **DL#90** — Headless instances in interactive forEach (no slow phase)
- **DL#102** — Headless instance SSR and hydration compilation
- **DL#105** — Headless component client defaults
- **DL#111** — Nested headfull full-stack components (template injection)

## Problem

Three composition patterns that users need are not supported:

### Scenario A: Headfull FS with a page-level keyed headless

A page has a headfull FS header and a page-level keyed headless for the cart. The header's template needs to show the cart item count.

### Scenario B: Headfull FS inside headfull FS

A page uses a layout component, and the layout's own jay-html uses a header component.

### Scenario C: Headless instance inside headfull FS template

A headfull FS header component's jay-html contains a `<jay:cart-indicator>` headless instance from a plugin.

## Analysis

### Scenario A: Headfull FS + page-level keyed headless

**What the developer writes:**

Page `page.jay-html`:

```html
<head>
  <script
    type="application/jay-headfull"
    src="./header/header"
    contract="./header/header.jay-contract"
    names="Header"
  ></script>
  <script
    type="application/jay-headless"
    plugin="wix-cart"
    contract="cart-indicator"
    key="cart"
  ></script>
  <script type="application/jay-data">
    data:
        pageTitle: string
  </script>
</head>
<body>
  <jay:header />
  <main>
    <h1>{pageTitle}</h1>
  </main>
</body>
```

Header's `header/header.jay-html`:

```html
<head>
  <script
    type="application/jay-headless"
    plugin="wix-cart"
    contract="cart-indicator"
    key="cart"
  ></script>
</head>
<body>
  <header>
    <img src="/logo.png" />
    <span>{cart.itemCount} items</span>
  </header>
</body>
```

Header's `header/header.jay-contract`:

```yaml
name: Header
tags:
  - tag: logoUrl
    type: data
    dataType: string
```

**What breaks:**

1. `parseHeadfullFSImports` reads `header.jay-html` but only extracts the `<body>` content (line 949). The `<head>` with its `<script type="application/jay-headless">` is ignored.

2. The injected template `<span>{cart.itemCount} items</span>` is compiled within `renderHeadlessInstance` against the Header contract's ViewState (`componentVariables = new Variables(headlessImport.rootType)` at `jay-html-compiler.ts:764`). The Header contract has no `cart` tag, so `{cart.itemCount}` fails compilation.

3. Even if the header declared `cart` in its own contract, there's no mechanism to pass page-level keyed headless data into a headfull FS component's scope.

**What the developer expects:**

The header component declares it needs a cart headless, the page provides it, and the cart data flows into the header's template automatically.

**What would need to work:**

The page should declare the keyed headless at page level (since the page owns the data pipeline), and the headfull component's template should receive the keyed headless data. This requires:

- The headfull component's jay-html head declares the keyed headless dependency
- `parseHeadfullFSImports` processes the component's head to discover keyed headless imports
- Those keyed headless imports get hoisted to the page level (added to page's `allHeadlessImports`)
- The component's `renderHeadlessInstance` child context includes the keyed headless in its variables

### Scenario B: Headfull FS inside headfull FS

**What the developer writes:**

Page `page.jay-html`:

```html
<head>
  <script
    type="application/jay-headfull"
    src="./layout/layout"
    contract="./layout/layout.jay-contract"
    names="Layout"
  ></script>
</head>
<body>
  <jay:layout>
    <main>
      <h1>{pageTitle}</h1>
    </main>
  </jay:layout>
</body>
```

Layout's `layout/layout.jay-html`:

```html
<head>
  <script
    type="application/jay-headfull"
    src="./header/header"
    contract="./header/header.jay-contract"
    names="Header"
  ></script>
</head>
<body>
  <div class="layout">
    <jay:header />
    <slot />
    <footer>footer content</footer>
  </div>
</body>
```

Header's `header/header.jay-html`:

```html
<body>
  <header>
    <img src="/logo.png" />
    <nav>...</nav>
  </header>
</body>
```

**What breaks:**

1. `parseHeadfullFSImports` processes page-level headfull imports only. It reads `layout.jay-html`, extracts its body, and injects it into `<jay:layout>`.

2. After injection, the page body contains:

   ```html
   <jay:layout>
     <div class="layout">
       <jay:header />
       <!-- NOT injected — layout's head was ignored -->
       <slot />
       <footer>footer content</footer>
     </div>
   </jay:layout>
   ```

3. Layout's `<script type="application/jay-headfull" src="./header/header">` in its `<head>` is never processed. `parseHeadfullFSImports` does not recurse into nested component jay-html heads.

4. `<jay:header>` is not recognized during compilation because no `JayHeadlessImports` entry exists for `header`. It would be treated as an unknown HTML tag or cause a validation error.

**What would need to work:**

`parseHeadfullFSImports` should recursively process headfull FS imports found in nested component jay-html heads. Each level's imports get hoisted to the page level (since all compilation happens at page scope after injection). Template injection must also be recursive — the layout's `<jay:header>` needs its content injected before the layout body is injected into the page.

### Scenario C: Headless instance inside headfull FS template

**What the developer writes:**

Page `page.jay-html`:

```html
<head>
  <script
    type="application/jay-headfull"
    src="./header/header"
    contract="./header/header.jay-contract"
    names="Header"
  ></script>
  <script
    type="application/jay-headless"
    plugin="wix-cart"
    contract="cart-indicator"
    names="CartIndicator"
  ></script>
</head>
<body>
  <jay:header />
  <main>
    <h1>{pageTitle}</h1>
  </main>
</body>
```

Header's `header/header.jay-html`:

```html
<body>
  <header>
    <img src="/logo.png" />
    <jay:cart-indicator />
  </header>
</body>
```

**What breaks:**

1. Template injection works — the header body is injected into `<jay:header>`, including `<jay:cart-indicator />`.

2. After injection, the page body is:

   ```html
   <jay:header>
     <header>
       <img src="/logo.png" />
       <jay:cart-indicator />
     </header>
   </jay:header>
   ```

3. The page compiler encounters `<jay:header>` and calls `renderHeadlessInstance`. This creates a child context with `headlessContractNames: new Set()` (`jay-html-compiler.ts:798`).

4. Inside the child context, `<jay:cart-indicator>` is processed by `renderNode` → `getComponentName`. Since `headlessContractNames` is empty, `cart-indicator` is not recognized as a headless instance. It's treated as a regular (unknown) HTML tag.

5. The cart indicator component never gets instantiated, its SSR/hydration code is never generated, and it silently disappears from the output.

**What would need to work:**

The child context inside `renderHeadlessInstance` needs to know about headless contracts that are available in the scope. Currently the comment says "Don't detect nested headless instances inside headless instances (for now)". This restriction needs to be lifted, at least for headfull FS components whose templates may legitimately contain headless instances.

## Decisions

### Scenario A: Do not support — restrict via validation

Page-level keyed headless components are designed for pages without code, where all functionality comes from a plugin. They don't support props — only params (URL parameters). Params are a page-level concept and make no sense for a nested component.

A headfull component that needs cart data should import the cart as a nested headless instance (Scenario C), not as a page-level keyed headless. The headfull component has its own contract and rendering phases — it can manage the cart indicator as a child component within its own template.

**Action:** Add a validation rule in `stack-cli validate` that headfull FS component jay-html files cannot declare page-level keyed headless imports (`<script type="application/jay-headless" key="...">` in a headfull component's head).

### Scenario B: Support — recursive headfull nesting

Headfull components should be able to import other headfull components. This is the natural composition model:

- A **page** imports a **layout** (headfull)
- The **layout** imports a **header** (headfull)
- The **header** imports a **cart-indicator** (headless, see Scenario C)

`parseHeadfullFSImports` must process component jay-html heads recursively. When loading a headfull component's jay-html, its `<head>` is scanned for nested `<script type="application/jay-headfull">` imports. Those are processed the same way — load their jay-html, inject templates, collect `JayHeadlessImports` entries — and all results are hoisted to the page level. Template injection must happen bottom-up: the innermost component templates are injected first, then their parents, so the final page body has all templates fully expanded.

The same applies to `injectHeadfullFSTemplates` (dev server runtime injection).

No depth limit — recursion terminates naturally since each level loads a different file. Circular imports should be detected and reported as an error.

### Scenario C: Support — headless instances inside headfull templates

Headfull components should be able to use headless instances in their templates. This is how a header component includes a cart indicator from a plugin:

Header's `header/header.jay-html`:

```html
<head>
  <script
    type="application/jay-headless"
    plugin="wix-cart"
    contract="cart-indicator"
    names="CartIndicator"
  ></script>
</head>
<body>
  <header>
    <img src="/logo.png" />
    <jay:cart-indicator />
  </header>
</body>
```

`parseHeadfullFSImports` must process the headfull component's `<head>` to discover headless imports (`<script type="application/jay-headless">`), not just headfull imports. These headless imports are hoisted to the page level alongside the headfull's own `JayHeadlessImports` entry. After template injection, `<jay:cart-indicator>` appears inside the headfull's injected body. The compiler must recognize it as a headless instance.

This requires lifting the `headlessContractNames: new Set()` restriction in `renderHeadlessInstance`. The child context should carry the set of headless contract names that the headfull component declared in its head.

### Component nesting rules summary

| Component type  | Can import headfull? | Can import headless (instance)? | Can import keyed headless? |
| --------------- | -------------------- | ------------------------------- | -------------------------- |
| **Page**        | Yes                  | Yes                             | Yes                        |
| **Headfull FS** | Yes (recursive)      | Yes (from its own head)         | No (validation error)      |
| **Headless**    | No (no template)     | No (no template)                | No (no template)           |

### Import hoisting

All component imports declared in nested headfull jay-html heads get **hoisted to the page level**. After recursive processing, the page's `allHeadlessImports` array contains entries from every level. Template injection flattens the entire tree into the page body. From the compiler's perspective, all `<jay:xxx>` tags exist in a single flat document — the nesting is resolved at parse time.

## Questions

1. ~~For Scenario A (keyed headless in headfull), should the headfull component declare its keyed headless dependencies in its own jay-html head, and have them hoisted to the page? Or should the page declare all keyed headless imports and pass data via props?~~ **Answered:** Not supported. Headfull components use headless instances (Scenario C) instead.

2. ~~For Scenario B (headfull in headfull), should nesting depth be limited (e.g., max 2 levels) or fully recursive?~~ **Answered:** Fully recursive, with circular import detection.

3. ~~For Scenario C (headless inside headfull), should the headless import be declared in the headfull component's jay-html head (and hoisted), or must it be declared at the page level?~~ **Answered:** Declared in the headfull component's own jay-html head. Hoisted to page level during parsing.

4. Does Scenario B require a slot/children mechanism (the layout's `<slot />` above) or is the headfull FS component always a leaf with no page-provided children?

5. ~~What's the priority order for implementing these? Are some scenarios more immediately needed than others?~~ **Answered:** Scenario C (headless in headfull) first, then Scenario B (headfull in headfull). Scenario A is a validation rule only.

## Appendix: Current Code Paths

### Template injection

`jay-html-parser.ts:parseHeadfullFSImports` (line 858):

- Iterates page-level `<script type="application/jay-headfull">` elements
- Reads each component's jay-html, extracts `<body>` content
- Injects body innerHTML into matching `<jay:Name>` tags in the page body
- **Does not recurse** into nested component heads

`jay-html-parser.ts:injectHeadfullFSTemplates` (line 800):

- Runtime injection for dev server (pre-render and SSR paths)
- Same single-level behavior

### Headless instance compilation

`jay-html-compiler.ts:renderHeadlessInstance` (line 698):

- Creates `componentVariables = new Variables(headlessImport.rootType)` — isolated to the component's contract ViewState
- Child context at line 788-799:
  ```typescript
  const childContext: RenderContext = {
    ...newContext,
    variables: componentVariables, // component's own ViewState only
    headlessContractNames: new Set(), // blocks nested headless detection
  };
  ```

### Slow render discovery

`slow-render-transform.ts:discoverHeadlessInstances`:

- Walks pre-rendered HTML to find `<jay:xxx>` tags
- Finds instances at the page level for slow phase rendering
- After template injection, would find `<jay:cart-indicator>` inside the injected template
- But compilation blocks it (see above), so discovery alone isn't sufficient

## Implementation Results

### Scenarios B+C implemented, Scenario A deferred

All compiler targets (element, hydrate, server), the slow-render pipeline, and the dev server were updated.

### Files modified

| File                                                            | Change                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `compiler-jay-html/lib/jay-target/jay-html-parser.ts`           | Recursive `parseHeadfullFSImports` with circular detection, headless import discovery in headfull heads, recursive `injectHeadfullFSTemplates` |
| `compiler-jay-html/lib/jay-target/jay-html-compiler.ts`         | Pass `headlessContractNames` through child context in `renderHeadlessInstance`                                                                 |
| `compiler-jay-html/lib/jay-target/jay-html-compiler-hydrate.ts` | Pass `headlessContractNames`/`headlessImports` through child contexts; strip parent `instanceCoordPrefix` from nested coordinate               |
| `compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts`  | Pass `headlessContractNames` through child context                                                                                             |
| `compiler-jay-html/lib/slow-render/slow-render-transform.ts`    | `discoverHeadlessInstances` and `resolveHeadlessInstances` recurse into `<jay:xxx>` children                                                   |
| `stack-server-runtime/lib/load-page-parts.ts`                   | Inject headfull FS templates before instance discovery (fixes client-only mode)                                                                |

### Deviations from original plan

1. **All three compiler targets needed the same fix** — the plan only mentioned `jay-html-compiler.ts` but `jay-html-compiler-hydrate.ts` and `jay-html-compiler-server.ts` also had `headlessContractNames: new Set()` blocking nested detection.

2. **Slow-render discovery/resolution needed recursion** — not in the original plan. `discoverHeadlessInstances` and `resolveHeadlessInstances` had `return` after processing `<jay:xxx>`, preventing nested instance discovery. Changed to recurse into children after processing.

3. **Hydrate coordinate stripping** — `childCompHydrate` received absolute coordinates, but nested instances need coordinates relative to their parent. Added prefix stripping when `instanceCoordPrefix` is set.

4. **Recursive path resolution** — nested headfull element `src`/`contract` attributes are relative to the component's directory, but generated imports must be relative to the page. Added path rewriting before recursing.

5. **`loadPageParts` template injection** — the client-only (SSR-disabled) path ran `discoverHeadlessInstances` on raw HTML without template injection. Added `injectHeadfullFSTemplates` call before discovery.

6. **Headfull FS components must have all three phases** — the runtime's `makeHeadlessInstanceComponent` expects an interactive constructor. Components with only `withSlowlyRender()` fail with "interactiveConstructor is not a function". This is a fixture requirement, not a compiler issue.

### Test results

- 571/571 hydration tests pass (including 32 new tests for 8i + 8j)
- 631/631 compiler tests pass (zero regressions)

### Post-implementation bug fix: headfull FS module path resolution

**Bug:** Headfull FS `src` attribute resolved from `projectRoot` instead of `filePath` (the importing jay-html file's directory). For deeply nested pages like `src/pages/products/kitan/[[category]]/page.jay-html`, the relative path `../../../../components/kitan-header` was resolved from the project root, producing `/Users/components/kitan-header/kitan-header` instead of `src/components/kitan-header`.

**Root cause:** `parseHeadfullFSImports` set `moduleResolveDir = projectRoot` whenever `projectRoot !== filePath`. This condition is true for ALL nested pages (not just pre-rendered), but the `projectRoot` fallback only makes sense when parsing pre-rendered files from `build/pre-rendered/` where the source modules are back in the source directory.

**Fix (three parts):**

1. **`readJayHtml` return type and directory convention** — Changed `readJayHtml` to return `{ content, componentDir }` instead of just the content string. The `componentDir` is the actual directory containing the jay-html file. Also added directory convention: tries `<src>.jay-html` first, then `<src>/<basename>.jay-html`. This supports component directories like `components/kitan-header/kitan-header.jay-html` where `src` points to the directory.

2. **Module path resolution** — `moduleResolveDir` tracks which base directory found the jay-html file. If `readJayHtml(filePath, src)` succeeds, module resolution uses `filePath`. If it falls back to `readJayHtml(projectRoot, src)`, module resolution uses `projectRoot`.

3. **Contract and CSS resolution from componentDir** — Moved `readJayHtml` before `loadContract`. Contract loading now has three fallbacks: `filePath`, `projectRoot`, and `componentDir` (the directory where the jay-html was found). CSS extraction uses `componentDir` directly instead of computing it from `path.dirname(path.resolve(filePath, src))` — which was wrong for the directory convention. This fixes pre-rendered files with deep relative paths where neither `filePath` nor `projectRoot` resolves correctly.

### Post-implementation: hydrate compiler and server pipeline fixes for headfull FS

Testing the golf project (headfull FS header with nested headless plugins in a separate `components/` directory) revealed several issues in the hydrate compiler and server-side rendering pipeline.

#### Bug 1: Case-insensitive component name matching

**Problem:** Headfull FS contract names are stored lowercase (from `names` attribute via `.toLowerCase()`), but `getComponentName()` uses `rawTagName` which preserves original casing (e.g., `KitanHeader`). The `Set.has()` check is case-sensitive, so `headlessContractNames.has("KitanHeader")` fails when the set contains `"kitanheader"`.

**Result:** The hydrate compiler treated the component as headful (`childComp`) instead of headless-instance (`childCompHydrate` + `makeHeadlessInstanceComponent`).

**Fix:** Lowercase at the three comparison points where `rawTagName` meets stored names:

- `getComponentName()` in `jay-html-helpers.ts` — `componentName.toLowerCase()` for `headlessContractNames.has()`
- `resolveHeadlessImport()` in `jay-html-compiler-shared.ts` — lowercase for matching
- `extractHeadlessCoordinate()` in `jay-html-compiler-shared.ts` — lowercase for coordinate segment lookup

**Additional case-sensitivity fixes:**

- `usedAsInstance` in `jay-html-parser.ts` — used lowercased tag names to build the set, ensuring `codeLink` imports are included for headfull FS components regardless of `names` casing
- `discoverHeadlessInstances()` in `slow-render-transform.ts` — uses lowercased tag names consistently

#### Bug 2: Duplicate ref bindings from slowForEach-expanded items

**Problem:** `mergeRefsTrees()` concatenated all refs from all trees without deduplication. When 50 slowForEach-expanded items each contributed a `categoryLink` ref, the hydrate render function got 50 `refCategoryLink` bindings — a JavaScript error (duplicate declarations).

**Fix:** Deduplicate refs by `constName` in `mergeRefsTrees()` (`render-fragment.ts`). When the same ref appears in multiple sibling trees (e.g., slowForEach items), keep one entry, preferring the repeated/collection variant. Refs with `null` constName (react target) are excluded from dedup.

#### Bug 3: Plugin client imports not rewritten in hydrate output

**Problem:** The `plugin-client-import-resolver` Vite plugin ran with `enforce: 'pre'`, processing files before the jay-runtime transform generated hydrate JS code. Plugin imports like `@jay-framework/wix-cart` in the generated hydrate code were never rewritten to `/client`, causing the server module to load in the browser.

**Fix:** Changed `enforce: 'pre'` to `enforce: 'post'` in `plugin-client-import-resolver.ts` so it runs after the jay-runtime transform generates the import statements.

#### Bug 4: Slow-only headfull FS components not rendered in SSR

**Problem:** The server element code checks `__headlessInstances['header:AR0']` to conditionally render a headfull FS component's content. But `fast-changing-runner.ts` only populated `__headlessInstances` for components with `fastRender`. Slow-only components (no fast phase) were never included, so their SSR output was empty.

**Fix:** In `fast-changing-runner.ts`, populate `__headlessInstances` for all discovered instances: slow ViewState for slow-only components, `{}` for static-only components (no phases at all). Also added `slowViewStates` field to `InstancePhaseData` so slow data flows through both the pre-render path and the `runSlowlyForPage` path.

#### Bug 5: Fast-only components dropped from instance discovery

**Problem:** `slowRenderInstances()` only added instances with `slowlyRender` to `discoveredForFast`. Fast-only components (like `cart-indicator` which has `fastRender` but no `slowlyRender`) were silently dropped. Since other instances DID have `slowlyRender`, the function returned non-undefined, skipping the fallback that would include all instances.

**Fix:** In `slowRenderInstances()`, always add all instances to `discoveredForFast` regardless of whether they have `slowlyRender`. The slow render step is optional — not having it shouldn't exclude the instance from the fast phase.

#### Test coverage added

- **8k fixture** — Headfull FS with separate `pages/` and `components/` directories, deep relative paths, PascalCase component names
- **8l fixture** — Slow-only headfull FS component (no fast/interactive phases), verifies SSR renders the component content

#### Known remaining issues

- **SSR disabled mode with PascalCase names** — The standard element target (client-only rendering) has issues with PascalCase headfull FS component names. SSR-enabled modes work correctly. 5 test failures in SSR disabled mode for 8j/8k.
- **Hydration warnings** — The golf project still has hydration-related issues to investigate separately.
