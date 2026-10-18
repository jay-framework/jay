# DL#221 — Bare HTML tags collide with same-named component/region imports

## Decisions for the Implementer (TL;DR)

- **Bug:** a plain HTML element whose tag name matches an imported component/region symbol (e.g. a component named `section` or `button`) is miscompiled as a child component via the **legacy bare-tag syntax** in `getComponentName` (`jay-html-helpers.ts:175-178`). The plain `<section class="section">` becomes `childComp(section, (vs) => ({class:'section'}), …)`; `section` is a `JayStackComponentDefinition`, not a constructor → **`compCreator is not a function`** at hydration.
- **Fix:** the legacy branch must **never** match a standard HTML element name. Guard it with `htmlElementTagNameMap`. Components/regions are addressed with `<jay:…>`; a bare tag that is a valid HTML element is always an HTML element.
- **Scope:** one-line guard in `getComponentName` + a compiler test. Fixes `/nested-composition` (component names `section`, `button` collide with the `<section>`/`<button>` HTML tags in the same template). Independent of DL#219.

## Background

DL#196 moved composed components into **regions** addressed as `<jay:contract-name>`. Region/headless imports add their symbol (e.g. `section`) to `importedSymbols`. The compiler's `getComponentName` still carries a pre-`<jay:>` **legacy syntax**: a bare tag whose name is in `importedSymbols` is treated as a headful component (`jay-html-helpers.ts:175-178`).

## Problem

`examples/jay-stack/smoke-test/src/pages/nested-composition/page.jay-html` nests regions whose contracts are named after HTML tags:

```html
<jay:section ref="section" title="Featured">
  <section class="section">
    <!-- plain HTML; collides with component `section` -->
    <h2>Section: {title}</h2>
    <jay:card heading="{title}">
      <div class="card">
        <jay:button label="{heading}">
          <button ref="clickAction" class="btn">Button: {label}</button>
          <!-- collides with `button` -->
        </jay:button>
      </div></jay:card
    >
  </section></jay:section
>
```

`section` and `button` are imported (headless code links) → in `importedSymbols`. The plain `<section>`/`<button>` match the legacy branch and compile to `childComp(section, …)` / `childComp(button, …)`:

```ts
// build/.../nested-composition/page.jay-html?jay-hydrate.ts
adoptElement('S1/0', {}, [
  childComp(section, (vs: SectionViewState) => ({ class: 'section' }), refAR1()),
]);
```

`section` is `makeJayStackComponent<…>().withProps()….` — a `JayStackComponentDefinition`, not a `ComponentConstructor`. `childComp` calls `compCreator(...)` → **`compCreator is not a function`**, crashing client hydration (SSR renders, then the page throws on hydrate). ✅ reproduces with `sourceEditing` off → not a DL#219 regression. (The _correct_ region instances — `<jay:section>` etc. — compile fine via `makeHeadlessInstanceComponent(section, …)`; only the bare-tag collision is wrong.)

## Prior Art / Adjacent Mechanisms

- `getComponentName` (`jay-html-helpers.ts:146-181`): `<jay:>` branch checks `headlessContractNames` then `importedSymbols`; the legacy branch (175-178) matches any bare tag in `importedSymbols`.
- `htmlElementTagNameMap` (`html-element-tag-name-map.ts`, exported from the package index): a Record keyed by every standard HTML tag (`section`, `button`, `article`, `aside`, `header`, `footer`, `main`, `nav`, …). The authoritative "is this an HTML element" source already in the compiler.

## Design

Guard the legacy branch: a bare tag that is a known HTML element is an HTML element, not a component.

```ts
// jay-html-helpers.ts, legacy branch
if (importedSymbols.has(tagName) && !(tagName in htmlElementTagNameMap)) {
  return { name: tagName, kind: 'headful' };
}
```

- Non-HTML names (e.g. `<MyWidget>`) keep working via legacy syntax.
- HTML-named components/regions are reachable only via `<jay:section>` (the `<jay:>` branch is unaffected — it matches on `headlessContractNames`/`importedSymbols` _after_ stripping the prefix, which is explicit intent).

**Null hypothesis / minimal surface:** no new API, no new marker, no runtime change — one conjunct on an existing condition, reusing the existing `htmlElementTagNameMap`. Prevention-first: this makes the miscompile impossible rather than warning about it.

## Implementation Plan

1. Import `htmlElementTagNameMap` into `jay-html-helpers.ts`; add the guard to the legacy branch.
2. Compiler test: a page importing a component named like an HTML tag (`section`) with a plain `<section>` in the template → the plain tag compiles as an HTML element (`e('section', …)` / `adoptElement`), not `childComp`. (No `toContain` on code — compare whole output or assert via the parsed structure.)
3. Verify `/nested-composition` loads without `compCreator is not a function` (both `sourceEditing` on and off), and the full compiler-jay-html + hydration suites stay green.

## Trade-offs

A bare `<section>` can no longer mean "the component named section" — intentional; it was ambiguous and collided with the HTML element. Authors use `<jay:section>` for the region (the DL#196 standard). Legacy bare-tag syntax survives only for non-HTML names.

## Verification

- `/nested-composition` hydrates cleanly (no console error); SSR + client render the nested section/card/button.
- A compiler fixture proves a plain HTML tag colliding with an imported component name compiles as HTML.

## Implementation Results

- **Fix:** `jay-html-helpers.ts` — imported `htmlElementTagNameMap`; legacy branch now `importedSymbols.has(tagName) && !(tagName in htmlElementTagNameMap)`.
- **Tests:** new `test/jay-target/get-component-name.test.ts` (5 cases: jay-prefixed headless + headful; legacy non-HTML name still matches; HTML names `section`/`button`/`header` return null even when imported; plain `div` null). Full compiler-jay-html suite 755 pass.
- **Verified live:** `/nested-composition` with `sourceEditing: true` → no console errors; DOM renders `Section: Featured` / `Card: Featured` / `Button: Featured` (data threads through all three nested regions). Generated hydrate now emits `adoptElement("S1/0", …, [adoptText(… \`Section: ${vs.title}\`)])`for the plain`<section>`— zero`childComp(section|button)`. (The bug reproduced with `sourceEditing` off too, confirming independence from DL#219; the fix is in the compiler, so it holds for both.)
- **Deviation from plan:** tested `getComponentName` directly as a unit (it is exported) rather than via a full compile fixture — smaller, targets the exact decision.
