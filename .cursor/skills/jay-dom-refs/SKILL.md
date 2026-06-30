---
name: jay-dom-refs
description: DOM access in Jay Stack projects — use refs and jay-html ViewState, not document.querySelector or imperative createElement. Use when writing page.ts interactive logic, overlays, drags, focus, measuring elements, or global listeners.
---

# Jay DOM Access — Prefer Refs

Jay Stack owns the DOM lifecycle. Component logic (`page.ts`, headfull components) must cooperate with the framework, not bypass it with direct `document` access.

## Default approach

1. **Declare elements in `page.jay-html`** (or the component template) with `ref="myElement"`.
2. **Bind data** with ViewState (`{value}`, `forEach`, `if`) — do not build lists with `document.createElement` in a loop.
3. **Interact** via Jay ref handlers (`refs.myElement.onclick`, `oninput`, …) or `refs.myElement.exec$((el) => …)` for imperative DOM APIs (focus, scroll, measure).

```typescript
// Good — element comes from jay-html ref
refs.chatInput.onclick(() => {
  refs.chatInput.exec$((el) => (el as HTMLTextAreaElement).focus());
});
```

```html
<!-- Good — UI and structure live in the template -->
<div if="showPanel" ref="myPanel" style="left:{panelLeft}px">
  <button forEach="rows" trackBy="id" ref="rowBtn">{label}</button>
</div>
```

## Collection refs (forEach)

Bind handlers on the collection proxy, not the collection object itself:

```typescript
refs.items.itemButton.onclick(({ event }) => {
  /* per-row handler */
});
```

In jay-html, use a distinct ref name on the repeated element (e.g. `ref="itemButton"` inside `forEach="items"`).

## Avoid unless necessary

- `document.querySelector` / `getElementById` for elements Jay already renders
- `document.body.appendChild` for UI that belongs in the page template
- `document.addEventListener('mousemove'|'mouseup')` for drags — use **pointer capture** on the ref element that started the drag

```typescript
captureElement.setPointerCapture(event.pointerId);
captureElement.addEventListener('pointermove', onMove);
captureElement.addEventListener('pointerup', onEnd, { once: true });
```

## When `document` is acceptable

Use sparingly. Add a one-line comment explaining why.

| Case | Example |
|------|---------|
| Offscreen / non-UI nodes | `document.createElement('canvas')` for image export |
| Hit-testing at arbitrary coordinates | `document.elementFromPoint` during cross-overlay drag |
| Tests | `document.dispatchEvent` in Vitest |

Global shortcuts or paste routing: prefer a root shell ref (`ref="appRoot"`) with capture listeners before `document`.

## Checklist before adding `document.*`

1. Is there already a `ref` in jay-html for this element?
2. Can this UI be driven by ViewState instead of imperative DOM?
3. For drags: can pointer capture on the starting ref replace document-level listeners?
4. If still needed: document the exception in a design log or inline comment.

## Related docs

- Cursor rule: `.cursor/rules/jay-dom-refs.mdc` (jay monorepo)
- Agent kit: `agent-kit/developer/component-refs.md` (generated from `agent-kit-template`)
- Page components: `agent-kit/developer/page-components.md`
