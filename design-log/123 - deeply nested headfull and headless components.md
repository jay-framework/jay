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

## Questions

1. For Scenario A (keyed headless in headfull), should the headfull component declare its keyed headless dependencies in its own jay-html head, and have them hoisted to the page? Or should the page declare all keyed headless imports and pass data via props?

2. For Scenario B (headfull in headfull), should nesting depth be limited (e.g., max 2 levels) or fully recursive?

3. For Scenario C (headless inside headfull), should the headless import be declared in the headfull component's jay-html head (and hoisted), or must it be declared at the page level?

4. Does Scenario B require a slot/children mechanism (the layout's `<slot />` above) or is the headfull FS component always a leaf with no page-provided children?

5. What's the priority order for implementing these? Are some scenarios more immediately needed than others?

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
