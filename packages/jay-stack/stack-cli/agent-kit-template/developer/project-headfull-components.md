# Project headfull components

Reusable **project-owned UI blocks** (headers, footers, nav, promos) live under `src/components/`. Each module is a Jay Stack headfull component: logic (`*.ts` with `makeJayStackComponent`), view (`*.jay-html`), and contract (`*.jay-contract`).

## When to extract

- **Do** extract when the same UI appears on multiple pages or should stay consistent site-wide.
- **Do not** extract one-off page sections that will never be reused — keep those in the page’s own `page.jay-html`.

## Create

1. Add a folder under `src/components/<name>/` (or a single `src/components/<name>.ts` for very small widgets).
2. Export exactly **one** `export const <ExportName> = makeJayStackComponent(...)` per logic file.
3. Pair view + contract in the **same directory** as the logic file (shared filenames are allowed when only one `*.jay-html` or `*.jay-contract` exists in that folder).
4. Run `jay-stack validate` and test in dev.

## Edit

Change contract, jay-html, and TypeScript logic together. Re-run `jay-stack validate` after edits.

## Delete

1. Remove the component files under `src/components/`.
2. Search `src/pages` and `src/components` for imports/bindings and remove them.
3. Run `jay-stack validate`.

## Use on a page

Import and bind the headfull component in the target `page.jay-html` per Jay Stack headfull rules (`page-components.md`, designer jay-html component binding guides).

## AIditor Add Menu

When AIditor is installed, discoverable modules appear under **+ Add → Project → Headfull components**. AIditor scans `src/components/` at catalog read time (no per-component yaml). Attaching an item adds agent instructions with `moduleKey`, paths, and contract stem — wiring the import is an **agent outcome**, not an immediate DOM change.

## Dev workflow after syncing the aiditor plugin

1. Stop the dev server.
2. Optionally remove `node_modules/.vite`.
3. Start `jay-stack dev` again.
4. Hard-refresh `/aiditor` in the browser.
