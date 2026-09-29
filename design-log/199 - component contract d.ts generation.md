# DL#199 — Component contract `.d.ts` generation

## Decisions for the Implementer (TL;DR)

- **Problem:** jay-stack generates `.d.ts` only for **route pages** (`page.jay-html.d.ts`). Component contracts
  (`src/components/**/*.jay-contract`, plugin contracts, any non-route contract) get **no** `.d.ts`, so their
  `.ts` files — and the route `page.jay-html.d.ts` that _imports_ those component types — fail `tsc`.
- **Rule (honors the existing "don't generate both" decision):**
  - **Route page** → generate `page.jay-html.d.ts` (unchanged). It _inlines_ its own data-contract types and
    _imports_ the types of any linked headless component contracts.
  - **Every other `.jay-contract`** (components, plugins, nested) → generate `<name>.jay-contract.d.ts`.
  - **Skip** exactly the contracts that a route page inlines — the route's `application/jay-data` contract
    (`JayHtmlSourceFile.contractRef`) — to avoid the double-`PageViewState` problem that motivated the original
    "generate one, not both" decision.
- **Why no double for components:** a route `page.jay-html.d.ts` **imports** linked component types
  (`import { DismissCardViewState } from '../../components/dismiss-card/dismiss-card.jay-contract'`) rather than
  redefining them — so generating the component's own `.jay-contract.d.ts` is what makes that import resolve. The
  only redefinition is the route's inlined _data_ contract, which is the single thing we skip.
- **Scan scope:** all `.jay-contract` under the project root (excluding `node_modules`, `build`, `dist`, `.git`),
  minus the route data-contract skip-set. (Chosen over "only `src/components`" so plugin/nested contracts are
  covered too.)
- **Wire into both** the dev server (`stack-cli/lib/server.ts`) and the production build (`runBuild` in
  `stack-cli/lib/run-production.ts`) so `yarn build:check-types` passes on a fresh checkout after either.
- **Reuse existing primitives:** `parseContract` + `compileContract` (already used by the rollup `jayDefinitions`
  plugin and the compiler CLI). No new compiler surface.

## Background

`generatePageDefinitionFiles` (`stack-cli/lib/generate-page-definition-files.ts`) is the only `.d.ts` generator in
the live jay-stack flow. It iterates `routes` and writes `<page.jay-html>.d.ts` per route, bailing when there is no
jay-html. Nothing generates `.jay-contract.d.ts`. The `jayDefinitions` rollup plugin
(`rollup-plugin/lib/definitions/definitions-compiler.ts`) does generate contract `.d.ts`, but it is wired only into
the standalone compiler CLI, not jay-stack. The `*.jay-contract.d.ts` files under `dev-server/test/` are stale
committed fixtures (DL#111); the dev-server package emits no `.d.ts` at runtime.

The "don't generate both a jay-html `.d.ts` and a contract `.d.ts` for the same page" decision was made to avoid two
diverging sources of `PageViewState`. It is currently implemented as "only ever generate the jay-html one." That is
correct for a page's own data contract, but it over-applies: components (which are contract-first and whose `.ts`
imports from `./X.jay-contract`) get nothing.

## Prior Art / Adjacent Mechanisms

- `compileContract(parsed, absPath, JAY_IMPORT_RESOLVER): WithValidations<string>` — compiles a parsed contract to
  a `.d.ts` string. Already the engine behind `jayDefinitions` and the compiler CLI. **Reused as-is.**
- `parseContract(yaml, filename): WithValidations<Contract>` — parser. Reused.
- `checkValidationErrors(WithValidations<string>): string` — unwrap-or-throw. Reused.
- `JayHtmlSourceFile.contractRef` — the raw `application/jay-data` `contract="…"` value on a page; resolved against
  the jay-html dir it is the absolute path of the inlined data contract. Used to build the skip-set.
- `resolvedConfig.devServer.componentsBase` (`./src/components`) exists but is **not** used as the scan root —
  scanning the whole project root is broader and matches "all non-route contracts."

Null hypothesis check: no new compiler API is needed — `compileContract` already does the file-content generation.
The only new code is a project-walk + skip-set in `stack-cli`, mirroring the existing page generator.

## Design

New `stack-cli/lib/generate-contract-definition-files.ts`:

```ts
export async function generateContractDefinitionFiles(
  projectRoot: string,
  skipContracts: Set<string>, // absolute paths of route data contracts (already inlined into page.jay-html.d.ts)
): Promise<void>;
```

- Recursively walk `projectRoot`, collecting `*.jay-contract` (skip `node_modules`, `build`, `dist`, `.git`).
- For each not in `skipContracts`: mtime-skip if `<path>.d.ts` is newer than source; else
  `parseContract` → `compileContract` → `checkValidationErrors` → write `<path>.jay-contract.d.ts`.
- Warn (don't throw) on a contract that fails to compile, mirroring the page generator.

`generatePageDefinitionFiles` returns the skip-set it inlined: for each route, resolve
`path.resolve(path.dirname(jayHtmlPath), parsedJayHtml.contractRef)` and collect. (Already parses the jay-html.)

Call sites:

- Dev — `server.ts`: `const skip = await generatePageDefinitionFiles(...); await generateContractDefinitionFiles(process.cwd(), skip);`
- Build — `runBuild` (`run-production.ts`): same two calls before/after `buildVersion` (needs the routes; reuse the
  route scan already available via the production context / route-scanner).

## Verification criteria

1. After `yarn dev` (or `yarn build`) on `examples/jay-stack/smoke-test`, every component contract has a sibling
   `*.jay-contract.d.ts` (e.g. `src/components/dismiss-card/dismiss-card.jay-contract.d.ts`).
2. No `page.jay-contract.d.ts` is generated for a route page (skip-set honored) — the page keeps a single
   `page.jay-html.d.ts`.
3. `cd examples/jay-stack/smoke-test && yarn build:check-types` (`tsc`) passes (currently fails project-wide on
   `Cannot find module './x.jay-contract'`).
4. All existing smoke tests still pass.

## Trade-offs

- Generated `.jay-contract.d.ts` are build artifacts → must be gitignored (same as `*.jay-html.d.ts`).
- A page whose data contract lives outside its route dir is handled correctly because the skip-set is derived from
  `contractRef` (the actual link), not from directory location.
- Slightly more work per dev start / build (one parse+compile per component contract), bounded by project size and
  mtime-skipped on repeat.

## Implementation Results

**Status: DONE.** All verification criteria met except #2, which was **reversed** during implementation (see
deviation below). `tsc` passes clean on the smoke-test; 71/71 smoke tests pass; dev-mode `/headfull` renders 200.

### Key deviation — generate BOTH `page.jay-html.d.ts` and `page.jay-contract.d.ts` for routes

The original TL;DR rule was "skip the route's data contract to avoid a double `PageViewState`." Implementation
uncovered two facts that make the skip **incorrect**:

1. **Runtime enum values can only come from the compiled contract module.** `/headfull`'s `page.ts` uses
   `CurrentStatus.warning` (a `variant` enum) as a runtime _value_. That value can't be imported from
   `./page.jay-html`: `page.jay-html` is the browser _element_ module, so loading it in server-side SSR drags in
   child-component/DOM deps (`../../components/banner/banner`, …) and 500s in dev. The value must come from
   `./page.jay-contract` (a lightweight compiled contract module, no element deps) — which requires a
   `page.jay-contract.d.ts` for `tsc` to resolve.
2. **Free refs (DL#198) and composed child refs exist only in `page.jay-html.d.ts`.** A page's `PageElementRefs`
   (e.g. `plainCard.dismiss` on `/free-ref`) is synthesized from jay-html region analysis and is **not** in the data
   contract (which only declares `pageTitle`). So the jay-html d.ts can't be dropped either.

The two d.ts are therefore **not redundant** — they cover different surfaces:

| file                     | surface                                                                           | imported by                                              |
| ------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `page.jay-html.d.ts`     | composed refs — child component refs + DL#198 free refs (the interaction surface) | `page.ts` (type-only) when it reaches jay-html-only refs |
| `page.jay-contract.d.ts` | data-contract types + runtime enum/variant **values** (the data surface)          | `page.ts` when it needs data types or runtime values     |

**No double-type conflict in practice** because a single `page.ts` never mixes the _same logical type_ from both
modules: it takes the enum + its `ViewState`/`PageContract`/`PageRefs` from `./page.jay-contract`, and (separately)
jay-html-only refs type-only from `./page.jay-html`. `tsc` sees two module-scoped declarations, never a clash.

### The pattern (for the agent-kit guide)

- **Types (ViewState, `PageContract`) and runtime enum/variant values from the page's own data** → import from
  `./page.jay-contract` (mirrors how a component's `.ts` imports from its `./X.jay-contract`).
- **Composed refs that come from the jay-html (child component refs, DL#198 free refs)** → import **type-only** from
  `./page.jay-html` (erased at compile, so no server-side element load).
- Components are unchanged: `.ts` imports from `./X.jay-contract`.

### Other implementation notes

- **Scan scope narrowed to `src/`** (per feedback) instead of the whole project root — `generateContractDefinitionFiles(path.resolve('src'))`.
- `generatePageDefinitionFiles` reverted to returning `void` (the skip-set is gone) and now takes a plain
  `jayHtmlPaths: string[]` (dropped the `DevServerRoute[]` dependency) so both the dev server
  (`server.ts`) and the build (`run-production.ts`, via `glob('**/page.jay-html')`) call it cleanly.
- Wired into both `startDevServer` (`server.ts`) and `runBuild` (`run-production.ts`).
- Smoke-test `page.ts` files updated to the pattern above: the 4 type-only pages import from `./page.jay-html`;
  `/headfull` imports everything (incl. `CurrentStatus` value + `PageRefs`) from `./page.jay-contract`.
- Generated `*.jay-contract.d.ts` already covered by the repo `.gitignore` (`examples/**/*.d.ts`).

### Verification (actual)

1. ✓ Every component contract has a sibling `*.jay-contract.d.ts` (badge, banner, button, card, dismiss-card,
   info-box, inner-block, section, tag-card).
2. ✗→**reversed**: route pages now DO get `page.jay-contract.d.ts` **in addition to** `page.jay-html.d.ts` (rationale above).
3. ✓ `cd examples/jay-stack/smoke-test && yarn build:check-types` passes clean.
4. ✓ 71/71 smoke tests pass; dev `/headfull` and `/free-ref` both return 200.
