# Design Log #134 — `display:contents` for Wrapper Elements

## Background

Jay's compiler wraps component content in container `<div>` elements for coordinate tracking and hydration. These wrappers exist at two levels:

1. **Page root** — the first element inside `<body>` in the page template, assigned coordinate `S0/0` by `assignCoordinates`
2. **Headfull FS component wrappers** — the `<jay:ComponentName>` tag that receives injected body content via `injectHeadfullFSTemplates`
3. **Multi-child headless instance wrappers** — synthetic `<div>` created in `assignCoordinates` (line 222-228) when a headless instance has multiple children

All three wrapper types serve the same purpose: provide a DOM node for `jay-coordinate` so the hydration target can find and adopt elements. They are structural scaffolding, not layout elements.

## Problem

These wrapper elements participate in CSS layout, creating an intermediate containing block between the component's children and their intended layout parent. This breaks:

- `position: sticky` — the wrapper is only as tall as its content, leaving no room to stick
- Flex/grid layout — children of the wrapper don't participate in the parent's flex/grid context
- `z-index` stacking — the wrapper creates an unnecessary stacking context boundary

Example (headfull FS component):

```html
<div jay-coordinate="S0/0">
  <!-- page root -->
  <div jay-coordinate="S1/0">
    <!-- component wrapper -->
    <div class="sticky-nav">...</div>
    <!-- sticky broken — parent too short -->
  </div>
</div>
```

Example (multi-child headless instance):

```html
<div jay-coordinate="S0/0">
  <div jay-coordinate="S2/0">
    <!-- synthetic wrapper div -->
    <span>child 1</span>
    <span>child 2</span>
    <!-- layout doesn't match parent grid/flex -->
  </div>
</div>
```

## Fix

Add `style="display:contents"` to all wrapper elements. `display:contents` removes the element from the layout tree while keeping it in the DOM — `jay-coordinate`, hydration adoption, and event delegation continue to work, but the element no longer creates a containing block.

## Where to Apply

### 1. Headfull FS component wrappers (Approach A from golf agent)

**File:** `compiler-jay-html/lib/jay-target/jay-html-parser.ts`, line 876

After `jayTag.set_content(jayHtmlBody.innerHTML)`, set the style attribute on the `jayTag`:

```ts
jayTag.set_content(jayHtmlBody.innerHTML);
jayTag.setAttribute('style', 'display:contents');
```

The style flows through both server and hydrate targets automatically because both render attributes from the element.

### 2. Multi-child headless instance wrappers

**File:** `compiler-jay-html/lib/jay-target/assign-coordinates.ts`, line 223

After creating the synthetic wrapper `<div>`, set `display:contents`:

```ts
const wrapper = parse('<div></div>').querySelector('div')!;
wrapper.setAttribute('style', 'display:contents');
```

No hydrate target change needed — `adoptElement` finds the server-rendered element by coordinate and adopts it in place. The `display:contents` style is already on that DOM element from SSR. The `adoptBase` function only processes dynamic attributes (those with `valueFunc`), so static strings in the attributes object would be ignored anyway.

### 3. Page root element

The page root is the actual first element inside `<body>` in the jay-html template — it's authored by the user, not synthesized by the compiler. The user controls its styles directly, so no compiler change is needed here.

However, if the page root is a `<jay:ComponentName>` tag (a headfull FS component used as the root), it falls under case #1 above and gets `display:contents` automatically.

## Verification

1. Headfull FS component with `position: sticky` on an inner element sticks correctly on scroll
2. Multi-child headless instance inside a flex/grid parent — children participate in parent layout
3. Hydration still works — interactive refs inside wrapped components respond to events
4. Coordinate-based adoption works — dynamic content updates correctly
5. Existing style attributes on `<jay:Name>` tags are not clobbered (check if any exist)

## Questions

1. Can `<jay:Name>` tags have user-specified `style` attributes that we'd overwrite? If so, we need to merge rather than replace.
   **Answer:** Grep shows no `<jay:...` tags with `style=` in the codebase. Since `<jay:Name>` tags are component insertion points (not regular HTML), users don't style them directly. Safe to use `setAttribute('style', ...)` without merging.

2. Does `adoptElement` in the runtime support a `style` property in the attributes object? Need to verify the runtime API.
   **Answer:** `adoptBase` (hydrate.ts:176-197) only processes dynamic attributes (objects with `valueFunc`). Static string attributes are ignored — the element already exists in the DOM from SSR with the correct style. No hydrate target change needed.
