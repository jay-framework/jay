# DL#236 — a page contract freezes keyed headless text and `if` bindings

Status: **[Implemented]** — bug root-caused, fixed, tests green.

## Decisions for the Implementer (TL;DR)

- **Symptom:** a page with its own `page.jay-contract` that declares any interactive tag (a ref, or
  `fast+interactive` data) and imports a key-based headless component
  (`<script type="application/jay-headless" plugin=… contract=… key="k">`) hydrates, but after
  interaction `{k.someText}` and `if="k.flag"` keep their SSR values. Attribute bindings
  (`aria-invalid="{k.invalid}"`) keep updating. Happens with or without `page.ts`. Removing the page
  contract fixes it. SSR-disabled (element target) is unaffected.
- **Root cause:** the hydrate and server targets build the page's set of interactive root paths from
  the **page contract only** — `buildInteractivePaths(contract)` at
  `jay-html-compiler-hydrate.ts:1422` and `jay-html-compiler-server.ts:1133` (before the fix). Keyed
  headless keys are never in the set. ✅ verified
- **Why only with a page contract:** an empty set means "no phase info — treat as interactive". A
  page contract with an interactive tag makes the set non-empty (`getEffectivePhase` makes every
  `interactive` tag `fast+interactive`, `contract-phase-validator.ts:20-24`). From then on, a
  binding whose root (`k`) is not in the set counts as slow/fast-only. ✅ verified
- **Why text and `if` but not attributes:** text adoption is dropped when
  `interactivePaths.size > 0 && !textHasInteractiveBindings(...)` (`jay-html-compiler-hydrate.ts:1032-1052`),
  and a conditional is only hydrated when `conditionIsInteractive(...)` (`:181-183`). Dynamic
  attributes are not gated by `interactivePaths`. ✅ verified
- **Fix:** new `buildPageInteractivePaths(contract, headlessImports)` in
  `jay-html-compiler-phase.ts`. It returns the page contract's paths plus the `key` of every keyed
  headless import whose contract has a `fast+interactive` tag (or whose contract is unresolved). An
  empty page set is returned unchanged, so pages without phase info behave exactly as before. Both
  page-level call sites use it. Per-instance call sites (`buildInteractivePaths(headlessImport.contract)`)
  are unchanged.
- **Not changed:** `buildInteractivePaths` itself, the slow-render transform, the runtime.

## Background

DL#118 added phase-aware hydration: the hydrate target skips adoption for bindings that cannot change
on the client, and the server target skips their `jay-coordinate`. The set of "interactive roots" is
derived from contracts. Key-based headless components (`key` attribute on `jay-headless`) put their
ViewState under `viewState[key]`, so their bindings in the page template are `{key.prop}`.

## Problem

Minimal repro (fixture `dev-server/test/6b-page-keyed-headless-with-page-contract`):

```yaml
# headless-component.jay-contract
tags:
  - { tag: message, type: data, dataType: string, phase: fast+interactive }
  - { tag: isActive, type: variant, dataType: boolean, phase: fast+interactive }
  - { tag: invalid, type: data, dataType: boolean, phase: fast+interactive }
  - { tag: toggle, type: interactive, elementType: HTMLButtonElement }
```

```yaml
# page.jay-contract (no page.ts)
tags:
  - { tag: title, type: data, dataType: string, phase: slow }
  - { tag: pageButton, type: interactive, elementType: HTMLButtonElement }
```

```html
<p class="message">{headless.message}</p>
<span class="active" if="headless.isActive">on</span>
<input class="field" aria-invalid="{headless.invalid}" />
<button ref="headless.toggle">toggle</button>
<button ref="pageButton">page</button>
```

After clicking `toggle` (SSR modes): `aria-invalid="true"` ✅, `.message` stays `idle` ❌, `.active`
never appears ❌. Page interactive set was `{pageButton}`; `headless` was missing.

A page contract with **only slow** tags gives an empty set, so it does not trigger the bug (this is
why the existing fixture 6a passes).

## Prior Art / Adjacent Mechanisms

- `buildInteractivePaths` (DL#118) — correct for a single contract; the bug is in which contracts
  the page-level call feeds it. Reused, not changed.
- Headless **instances** (`<jay:name>`) already get their own set from their own contract
  (`jay-html-compiler-hydrate.ts:666`, `jay-html-compiler-server.ts:289`). Keyed headless had no
  equivalent. The fix gives keyed imports the same treatment at the page level.
- `extractTrackByMaps` (`jay-html-parser.ts:1234-1284`) already walks page contract **and** keyed
  headless contracts with the key as prefix — the same merge the interactive set was missing.

## Questions and Answers

- **Q: Add the key, or the prefixed nested paths (`headless.message`)?** A: The key.
  `textHasInteractiveBindings` and `conditionIsInteractive` match on the **root identifier** only,
  so the key is what they test.
- **Q: Why not also add keys when the page set is empty?** A: An empty set already means "treat as
  interactive". Adding keys there would make the set non-empty and change today's output for
  slow-only page contracts (e.g. drop the coordinate of a slow `{title}`). That may be more correct,
  but it is not this bug. Left as is.
- **Q: Unresolved headless contract?** A: Treated as interactive. Freezing live data is worse than
  adopting static data.

## Design

```ts
// jay-html-compiler-phase.ts
export function buildPageInteractivePaths(
  contract: Contract | undefined,
  headlessImports: { key?: string; contract?: Contract }[],
): Set<string>;
```

`renderHydrate` (`jay-html-compiler-hydrate.ts:1423`) and the server element render
(`jay-html-compiler-server.ts:1134`) pass all headless imports (only keyed ones contribute). Both
targets use the same set, so SSR coordinates and hydrate adoption stay aligned.

## Implementation Plan

1. Failing fixtures `6b` (page contract + keyed headless) and control `6c` (no page contract) in
   `dev-server/test/hydration.test.ts`.
2. Add `buildPageInteractivePaths`; use it at both page-level call sites.
3. `yarn confirm`.

## Trade-offs

- A keyed headless whose contract has any interactive tag makes all its bindings adoptable, including
  its slow ones. That only costs an extra adopt; slow values never change, so output is correct.

## Verification Criteria

- 6b: after clicking toggle, text is `active`, the `if` span appears, `aria-invalid` is `true`, in
  all three modes (SSR disabled, first request, cached).
- 6c and all existing hydration fixtures (incl. 6a) unchanged and green.

## Agent feedback loop

- **Validation:** none — this is a compiler bug, not an author mistake.
- **Agent-kit guide:** none — authors did nothing wrong.

## Implementation Results

- Red (before fix): `6b … SSR first request / SSR cached request > interactivity works after
hydration` failed — `expected 'idle' to deeply equal 'active'`, DOM showed
  `aria-invalid="true"` with `.message` still `idle` and no `.active` span. 6c passed.
- First fix attempt added keys also when the page set was empty; it changed 6a's SSR fixture
  (dropped the slow `<h1>` coordinate). Narrowed to "non-empty set only" (see Q&A).
- Green: `dev-server` `hydration.test.ts` 735/735; `compiler-jay-html` 764 passed / 4 skipped.

### Downstream verification (2026-11-11)

A locally packed `compiler-jay-html` with this fix was installed into a downstream project that runs the published 0.26.1 packages, using a package-manager override. Two pages there import a keyed headless plugin form next to their own `page.jay-contract`, which has interactive tags. Both now update the plugin's text bindings and `if` conditionals live after hydration. One page had reproduced the bug before; the other is a fully declarative page (`page.ts` with refs, signals and context subscriptions inside `createEffect`). The earlier bisect note says a "slow-only" page contract also triggered the bug, but that contract had a `fast+interactive` tag. A truly slow-only page contract gives an empty page set, which already means "everything is interactive", so it never triggered the bug. That matches the unit test.

Unit test added (`test/jay-target/jay-html-compiler-phase.test.ts`, 5 cases): an empty page set is returned unchanged, a keyless import is skipped, multiple keys are added, slow-only and fast-only headless contracts are not added, and an unloadable contract is added. Without the fix (the old `buildInteractivePaths(contract)`), the "multiple keys" and "unloadable contract" cases fail. compiler-jay-html: 769 passed / 4 skipped (28 files). dev-server hydration: 735/735.
