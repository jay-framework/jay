# Design Log #183 — Root `<jay:contract>` Headless Instance Not Recognized by the Server-Element Compiler

> When a page's **body root element** is a headless instance (`<jay:contract-name>`), the SSR
> server-element compiler (`generateServerElementFile`) renders it as a **plain element** instead of a
> headless instance. Its inline-template bindings then resolve against the page's (empty) ViewState
> rather than the contract's ViewState, so every field the instance uses fails with
> `[SSR] the data field [X] not found in Jay data`. The client and hydrate compilers both special-case a
> root headless instance; the server compiler does not. This breaks the **wix-members `auth-callback`
> page** — the plugin's own reference template — and any page whose root is a `<jay:...>` instance.

## Background

- A page/component `.jay-html` declares headless component instances via
  `<script type="application/jay-headless" plugin="..." contract="...">` and instantiates them inline as
  `<jay:contract-name> ...inline template... </jay:contract-name>`. See #84 (headless component props and
  repeater support) and #90 (headless instances in interactive forEach without slow phase).
- The compiler has three code-generation targets that each walk the same parsed `.jay-html` body:
  - **client/main** — `generateElementFile` (`jay-html-compiler.ts`)
  - **hydrate** — `generateElementHydrateFile` (`jay-html-compiler-hydrate.ts`)
  - **server/SSR** — `generateServerElementFile` (`jay-html-compiler-server.ts`)
- In each target, the per-element renderer detects `<jay:contract-name>` via
  `getComponentName(rawTagName, componentImports, headlessContractNames)` returning
  `{ kind: 'headless-instance', name }`, and routes it to a dedicated renderer that binds the inline
  template children against the **contract's** ViewState (not the page's).
- `jay-stack validate` compiles all three targets for every `.jay-html`. The SSR compilation was wired
  into `validate` by commit `1e143e79` ("fix hydrate compiler: forEach inside headless instance template
  now resolves bindings correctly"), with the note _"Also validate server element compilation (SSR) —
  catches binding errors inside headless instance templates"_ (`stack-cli/lib/validate.ts:1240-1251`).
  That is why this defect now surfaces as a **validation error** rather than only a runtime SSR failure.

## Problem

`jay-stack validate` fails on the wix-members `auth-callback` page (the plugin's reference template,
shipped verbatim in `@jay-framework/wix-members/dist/tools.js`):

```
📦 jay-stack (core)
   ❌ src/pages/auth/callback/page.jay-html
      [SSR] the data field [isProcessing] not found in Jay data
   ❌ src/pages/auth/callback/page.jay-html
      [SSR] the data field [hasError] not found in Jay data
```

The page body root is the headless instance itself:

```html
<body>
  <jay:auth-callback>
    <main class="auth-callback">
      <div class="auth-callback-content">
        <div if="isProcessing">...</div>
        <div if="hasError"><p>{errorMessage}</p></div>
      </div>
    </main>
  </jay:auth-callback>
</body>
```

`isProcessing`, `hasError`, `errorMessage` are declared by the **`auth-callback` contract**
(`@jay-framework/wix-members/dist/contracts/auth-callback.jay-contract`, all `phase: fast+interactive`).
They are correctly available inside the `<jay:auth-callback>` instance scope — the **client** target
compiles this page with no errors. Only the **SSR** target rejects it.

Inspecting the generated SSR source makes the cause obvious — the `<jay:auth-callback>` tag is emitted
**literally as an element**, and the conditionals bind against the page's empty `PageViewState`:

```ts
export interface PageViewState {}

export function renderToStream(vs: PageViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<jay:auth-callback');                 // ← emitted as a literal element (WRONG)
    w(' jay-coordinate="S0/0">');
      w('<main'); w(' class="auth-callback"'); w('>');
        w('<div'); w(' class="auth-callback-content"'); ...
              if (vs.isProcessing) { ... }   // ← vs is PageViewState {} → field not found
              if (vs.hasError)     { ... }   // ← same
    ...
    w('</jay:auth-callback>');
}
```

The correct output would **not** emit a `<jay:...>` element at all; it would look up the instance
ViewState from `vs.__headlessInstances[...]` and bind the children against it (as
`renderServerHeadlessInstance` does for _nested_ instances).

**Why only the root, and only SSR:** _nested_ `<jay:...>` instances work in all three targets. For
example, `site-header.jay-html` embeds `<jay:cart-indicator>` and `<jay:login-indicator>` as children and
produces **no** SSR error — because child elements pass through `renderServerElement`, which performs the
headless check. The **root** element, however, is rendered by a different call that skips that check.

## Root Cause

`generateServerElementFile` renders the page's root element by calling `renderServerElementContent`
**directly**, bypassing `renderServerElement` — and `renderServerElementContent` contains no
headless-instance detection (that lives in `renderServerElement`).

`packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts`:

```ts
// generateServerElementFile(...) — line ~1080
const rendered = renderServerElementContent(rootElement.val as HTMLElement, context, {
  isRoot: true,
});
```

The headless check exists only on the child path (`renderServerElement`, lines ~111-121):

```ts
function renderServerElement(element: HTMLElement, context: ServerContext): RenderFragment {
  // --- Headless component instance (<jay:contract-name>) ---
  const componentMatch = getComponentName(
    element.rawTagName,
    new Set(), // no headful component imports in the server target
    context.headlessContractNames,
  );
  if (componentMatch !== null && componentMatch.kind === 'headless-instance') {
    return renderServerHeadlessInstance(element, context, componentMatch.name);
  }
  // ... conditional / forEach / regular element ...
}
```

Because the root never reaches `renderServerElement`, a root `<jay:contract>` is treated as a plain
element: its children are compiled against the page ViewState (`new Variables(jayFile.types)`, empty for
this page), so contract fields resolve to "not found in Jay data", and the `<jay:...>` tag leaks into the
HTML stream.

### The other two targets already handle this — the server target is the outlier

**Hydrate** target already has the exact fix (`jay-html-compiler-hydrate.ts:1307-1329`):

```ts
// Check if the root element is a headless instance (<jay:xxx>).
// renderHydrateElementContent doesn't detect headless instances — that's done by
// renderHydrateElement. When the root IS a headless instance, we must route through
// renderHydrateElement so the component's Variables and interactivePaths are used.
const rootComponentMatch = getComponentName(
  rootElement.val.rawTagName,
  context.importedSymbols,
  context.headlessContractNames,
);
let renderedHydrate: RenderFragment;
if (rootComponentMatch !== null && rootComponentMatch.kind === 'headless-instance') {
  renderedHydrate = renderHydrateElement(rootElement.val, context);
} else {
  renderedHydrate = renderHydrateElementContent(rootElement.val, context, /* forceAdopt */ true);
}
```

**Client/main** target renders the root through `renderNode` (`jay-html-compiler.ts:1333`), and
`renderNode`/`renderElement` performs the same headless-instance check (line ~538/544) — so the root
case is covered there too.

`generateServerElementFile` is missing the symmetric guard.

## How to Reproduce

Any page whose body root is a headless instance. Minimal repro against the built compiler
(run from inside a project that has `@jay-framework/*` installed, e.g. `examples/jay-onsko-shop`):

```js
import {
  parseJayFile,
  generateServerElementFile,
  JAY_IMPORT_RESOLVER,
} from '@jay-framework/compiler-jay-html';
import path from 'path';

const projectRoot = process.cwd();
const content = `<html><head>
<script type="application/jay-headless" plugin="@jay-framework/wix-members" contract="auth-callback"></script>
<script type="application/jay-data">
  data:
</script>
</head><body>
  <jay:auth-callback>
    <div class="c">
      <div if="isProcessing"><h1>signing in</h1></div>
      <div if="hasError"><p>{errorMessage}</p></div>
    </div>
  </jay:auth-callback>
</body></html>`;

const parsed = await parseJayFile(
  content,
  'page.jay-html',
  path.resolve(projectRoot, 'src/pages/auth/callback'),
  {},
  JAY_IMPORT_RESOLVER,
  projectRoot,
);
console.log('parse:', parsed.validations); // []
console.log('SSR:', generateServerElementFile(parsed.val).validations);
// → ['the data field [isProcessing] not found in Jay data',
//    'the data field [hasError] not found in Jay data']
```

**Control (confirms it is specifically the root case):** wrap the instance in any container so it is no
longer the body root — SSR validations become `[]`:

```html
<body>
  <main class="auth-callback">
    <!-- root is now <main> -->
    <jay:auth-callback>
      <div class="c">
        <div if="isProcessing">...</div>
        <div if="hasError"><p>{errorMessage}</p></div>
      </div>
    </jay:auth-callback>
  </main>
</body>
```

End-to-end: `cd examples/jay-onsko-shop && npm run validate` (also `misprint-goods-jay`) reports the two
`[SSR]` errors above. These examples use the wix-members reference template unchanged.

## How to Fix

Mirror the hydrate compiler: in `generateServerElementFile`, detect a root headless instance **before**
rendering, and route it through the headless path.

`packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts`, at the root-render site
(~line 1080):

```ts
// Check if the root element is a headless instance (<jay:xxx>).
// renderServerElementContent doesn't detect headless instances — that's done by
// renderServerElement. When the root IS a headless instance, route through it so the
// instance's ViewState (vs.__headlessInstances[...]) and interactivePaths are used,
// instead of binding the inline template against the page ViewState.
const rootComponentMatch = getComponentName(
  (rootElement.val as HTMLElement).rawTagName,
  new Set(), // no headful component imports in the server target
  headlessContractNames,
);
const rendered =
  rootComponentMatch !== null && rootComponentMatch.kind === 'headless-instance'
    ? renderServerElement(rootElement.val as HTMLElement, context)
    : renderServerElementContent(rootElement.val as HTMLElement, context, { isRoot: true });
```

Routing through `renderServerElement` reuses the existing `renderServerHeadlessInstance` path (which
already emits the `vs.__headlessInstances[...]` lookup and binds children against the contract
ViewState). Prefer this over duplicating the call to `renderServerHeadlessInstance` so the `if=`/`forEach`
handling on the root stays consistent with the child path.

### Coordinate / hydration alignment (must verify)

SSR HTML and the hydrate adopter must agree on coordinates (see #99 hydration coordinate alignment bugs,
#93 client hydration). For a **non**-root headless instance, `renderServerHeadlessInstance` derives the
element coordinate via `extractHeadlessCoordinate` and does **not** emit a wrapper `<jay:...>` element. The
non-headless root path passes `{ isRoot: true }` so the root emits `jay-coordinate="S0/0"` for
`adoptElement`. When the root **is** a headless instance, the hydrate target routes through
`renderHydrateElement` (its `renderHydrateHeadlessInstance`); the SSR fix must produce markup whose
coordinates the hydrate adopter resolves 1:1. Add a fixture where the **root** is a headless instance and
assert SSR-emitted coordinates match what the hydrate target adopts (the inline template's first child
element must carry the coordinate the adopter looks up). This is the one area where a naive "just call
`renderServerElement`" could still misalign — confirm against the hydrate output, not in isolation.

### Tests (regression, in the jay repo)

Full-string comparisons on generated code (per repo rules — no `toContain` on code):

1. **`compiler-jay-html` server test** — a page whose body root is `<jay:contract>` with `if=` bindings on
   contract fields generates SSR that (a) produces **no** validations, (b) emits **no** literal
   `<jay:...>` tag, and (c) reads the instance from `vs.__headlessInstances[...]` and binds children
   against the instance ViewState. Include a control where the same instance is nested (already passing)
   to lock in symmetry.
2. **`compiler-jay-html` cross-target coordinate test** — for a root headless instance, SSR coordinates
   and hydrate adoption coordinates match (guards the alignment note above).
3. **`stack-cli` validate test** — the wix-members `auth-callback` reference page validates clean across
   all three targets (regression against the exact failure this DL fixes).

## Verification Criteria

**Automated (must exist in the jay repo before this is "done"):**

- [ ] Server-target test: root `<jay:contract>` → no SSR validations; no literal `<jay:...>` in output;
      children bound to the instance ViewState (full-string compare).
- [ ] Coordinate-alignment test: SSR vs hydrate coordinates match for a root headless instance.
- [ ] Nested-instance control test still passes (no regression to the existing child path).
- [ ] Type-check + build clean for `compiler-jay-html`.

**Manual (end-to-end):**

- [ ] `cd examples/jay-onsko-shop && npm run validate` — the two `[SSR]` `auth-callback` errors are gone.
- [ ] `cd examples/misprint-goods-jay && npm run validate` — same.
- [ ] The wix-members `auth-callback` reference template (`dist/tools.js`) validates unchanged — no
      example-side workaround required.
- [ ] Runtime: the auth-callback page renders correctly under SSR + hydration (processing/error states),
      no `<jay:auth-callback>` tag in the served HTML.

## Relationship to Other Logs

- **Same class as `1e143e79`** ("forEach inside headless instance template") — both are cases where a
  code-gen target failed to resolve bindings **inside** a headless instance template. That fix also added
  the SSR compilation to `validate`, which is what now surfaces this root-element variant.
- **Consistency across targets** — client (`jay-html-compiler.ts`) and hydrate
  (`jay-html-compiler-hydrate.ts:1307-1329`) already special-case a root headless instance; this DL brings
  the **server** target (`jay-html-compiler-server.ts`) in line.
- **#99 hydration coordinate alignment bugs / #93 client hydration** — the fix must preserve SSR↔hydrate
  coordinate parity for the root instance (see the alignment note above).
- **#84 headless component props and repeater support / #90 headless instances in interactive forEach** —
  background on how `<jay:...>` instances and their ViewStates are compiled.

## Implementation Results (2026-09-08)

**Status: implemented.** Fix landed in
`packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler-server.ts` at the root-render site
in `generateServerElementFile` (~line 1078): detect a root headless instance via
`getComponentName(rootTag, new Set(), headlessContractNames)` (imported line 25; `headlessContractNames`
local at line 1061) and route it through `renderServerElement` (the child path, line 108, which owns the
headless check) when `kind === 'headless-instance'`; otherwise keep the existing
`renderServerElementContent(..., { isRoot: true })` path. Mirrors the hydrate target
(`jay-html-compiler-hydrate.ts:1311-1318`).

**Coordinate alignment — verified, no fix needed** (deviation from the DL's "must verify" caution: it
aligned by construction). Both targets run the identical `assignCoordinates(body, { headlessContractNames })`
pre-pass and read the same pre-assigned `jay-coordinate-base` via `extractHeadlessCoordinate`. Confirmed
empirically on the fixture: SSR emits `{S0/0/0, S0/0/0/0, S0/0/0/1, S0/0/0/2}` with instance key `S0/0`;
hydrate adopts exactly the same coordinates and `makeHeadlessInstanceComponent(..., 'S0/0', ...)`. A
cross-target test asserts this programmatically.

**Tests** (fixture/full-string based, no `toContain`):
`test/jay-target/generate-server-element.test.ts` +2 — (1) root `<jay:contract>` → no validations, no
literal `<jay:...>` tag, full `prettify` `toEqual` against the golden server fixture; (2) cross-target
coordinate-alignment set comparison. New fixture
`test/fixtures/contracts/page-with-root-headless-instance/` (`.jay-html` + golden server + hydrate). The
pre-existing nested-instance control still passes.

**Results:** `generate-server-element.test.ts` 22/22; full `compiler-jay-html` suite 698 passed / 4
pre-existing skips; `tsc --noEmit` clean; monorepo `yarn confirm` green.
