# Responsiveness (INP)

INP (Interaction to Next Paint) is the time from a click, tap or key press to the next frame the
user sees. Aim for **under 200 ms**. Everything a handler does before it returns delays that frame.

## 1. Do data work before the client

Jay has three phases. Only the **interactive** constructor (`.withInteractive(...)`) runs in the
browser on each interaction:

- Load, filter, sort and format data in `withSlowlyRender` (build) or `withFastRender` (request).
  Send the result as ViewState.
- In the interactive constructor, derive values with `createMemo` so they recompute only when their
  inputs change — not on every event. See [component-state.md](component-state.md).

## 2. Show feedback first, then work

Set a signal (spinner, pressed state) at the top of the handler, then yield, then do the work. The
browser can paint the feedback before the slow part.

```ts
const yieldToMain = () =>
  globalThis.scheduler?.yield
    ? scheduler.yield()
    : new Promise<void>((resolve) => setTimeout(resolve, 0)); // jay-inp: allow

refs.apply.onclick(async () => {
  setIsApplying(true); // feedback paints first
  await yieldToMain();
  for (const chunk of chunks) {
    process(chunk);
    await yieldToMain(); // let input in between chunks
  }
  setIsApplying(false);
});
```

**Do not yield with `setTimeout(fn, 0)`.** It sends the rest of the work to the back of the task
queue, behind everything else. `scheduler.yield()` resumes your work first. Keep `setTimeout` only
as the fallback above.

## 3. No `alert`, `confirm` or `prompt`

They block the main thread until the user answers, and the browser cannot paint. Build the dialog
in jay-html and drive it with ViewState:

```html
<button ref="remove">Remove</button>
<div if="confirmOpen" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
  <h2 id="confirm-title">Remove this item?</h2>
  <button ref="confirmYes">Remove</button>
  <button ref="confirmNo">Cancel</button>
</div>
```

```ts
const [confirmOpen, setConfirmOpen] = createSignal(false);
refs.remove.onclick(() => setConfirmOpen(true));
refs.confirmNo.onclick(() => setConfirmOpen(false));
refs.confirmYes.onclick(() => {
  setConfirmOpen(false);
  removeItem();
});
return { render: () => ({ confirmOpen: confirmOpen() }) };
```

## 4. Keep handlers light

- No large `JSON.parse` or `localStorage` loops in a handler. Read once when the component starts,
  keep the value in a signal, and write back only what changed.
- `fetch` in a handler is fine — it does not block. Set the loading state before you `await`.

## 5. Events go through refs, never `on*=` attributes

`onclick="..."` in jay-html bypasses Jay refs: no component owns the handler, it runs outside the
reactive batch, and it is an XSS sink. Add `ref="..."` and handle the event in the interactive
constructor (see [component-refs.md](component-refs.md)). `jay-stack validate` reports these
attributes as **INLINE-EVENT-HANDLER**.

## 6. Long lists

- Paginate, or render the list in the fast phase so the client does not build it.
- For long off-screen sections, `content-visibility: auto` skips their rendering — always pair it
  with `contain-intrinsic-size: auto <px>`. See `../designer/jay-html-styling.md`.

## What `jay-stack validate` checks

| Rule                                        | Flags                                                                     | Suppress                                               |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `inp/blocking-dialog`                       | `alert(` / `confirm(` / `prompt(`, bare or `window.`                      | `// jay-inp: allow` on the same line                   |
| `inp/settimeout-zero-yield`                 | `setTimeout(fn, 0)` with an explicit `0`                                  | `// jay-inp: allow` on the same line                   |
| `content-visibility-without-intrinsic-size` | `content-visibility: auto` without `contain-intrinsic-*` in the same rule | `seo: { allow-content-visibility-without-size: true }` |
| `INLINE-EVENT-HANDLER`                      | `on*=` attributes in jay-html                                             | see the validation guide                               |

What is scanned: the page's `.ts` file (`<name>.ts` next to the jay-html, or `page.ts`), and in it
only the function passed to each `.withInteractive(...)` call — an inline function, or a name
resolved to a `function` or `const`/`let`/`var` in the same file. An expression-bodied arrow
(`const Page = (p, refs) => wire(refs)`) ends at the first `;` or line break outside brackets. jay-html
templates, helpers outside the constructor, constructors imported from another file and headless
plugin components are **not** scanned. A clean validate does not prove a fast page.
