# Design Log #189 — Phase-Aware Prop Resolution (runtime + builder)

## Background

DL#152 established that headless-component contract **props have a `phase`** (`slow` default, `fast`, `fast+interactive`) and that a binding is only valid when its **source phase ≤ the prop's phase** — checked at compile time. DL#187 (pure headfull / Tier 2) relies on that guarantee: a Tier 2 passthrough has no `.ts`, so its ViewState is exactly the props the usage site binds, and those bindings must resolve at the right phase or the SSR output is wrong.

**Prior art — client-only Jay.** Jay without Jay Stack (the client-only framework, `makeJayComponent`) already supports interactive props, and it hands them to the component **as signals** — a prop is a reactive `() => T` the parent can change over time. So "a changing prop is a signal on the consuming side" is not a new idea introduced here; Jay Stack's interactive phase already inherits it. This log's job is to make the _server_ phases (slow/fast) resolve props at the right time so they line up with that already-signal-based interactive behavior — not to invent the signal model.

DL#152 shipped two of the three layers this needs:

- **Contract schema** — `ContractProp.phase` exists (`contract.ts:32`), parser accepts it.
- **Validation** — `jay-stack validate` enforces source-phase ≤ prop-phase (`validate.ts:756–841`).

What DL#152 did **not** build, and what this log designs:

1. **Runtime resolution never honors prop phase.** All instance prop bindings resolve **once at slow** (`slowRenderInstances`, `dev-server.ts:1214`, scope = `slowViewState`), store the resolved _literals_ in `instancePhaseData.discovered[].props`, and the fast phase merely re-normalizes those already-resolved literals (`fast-changing-runner.ts:99`). A `fast` prop bound to a `fast` tag resolves to `""` at slow and is never re-resolved from its raw binding.
2. **The builder uses a single `PropsT` for all phases** (`jay-stack-types.ts:190,200,221`) — so `slowlyRender` is typed to see props that only exist at fast, and `withInteractive` cannot receive a changing prop as a reactive signal.
3. **DL#152 collapsed `fast === fast+interactive`** (its A2/A6). The distinction we actually need — a `fast` prop is a _constant_ known at request time, a `fast+interactive` prop is a _reactive signal_ the parent can change on the client — was never modeled.

### Related

- DL#50 — Rendering phases in contracts
- DL#84 — Headless component props and repeater support (props-only channel, ViewState isolation)
- DL#109 — Unified dev server phase pipeline (where instances resolve today)
- DL#124 — Contract props / params consistency
- DL#152 — Phase-aware contract props (annotation + compile-time validation — this log's predecessor)
- DL#156 — Keyed headless component props
- DL#187 — Pure headfull components (Tier 2 passthrough — the main beneficiary)

## Problem

A page tag that becomes available at `fast` or `fast+interactive` cannot drive a child instance's prop at SSR, even though the binding is semantically valid.

```yaml
# page.jay-contract — currentStatus is set at request time / changes on the client
- tag: currentStatus
  type: variant
  dataType: enum (success | warning | error)
  phase: fast+interactive
```

```html
<jay:badge status="{currentStatus}" label="Dynamic" count="7" featured="false" />
```

Observed (verified against the smoke test): the badge instance's fast ViewState carries `status: ""` — `{currentStatus}` was resolved at **slow**, where `currentStatus` does not yet exist, and the raw binding was discarded before the fast phase ran. The hydration bootstrap _does_ ship `currentStatus: 1` in the interactive ViewState, so the client eventually renders correctly — producing an SSR-vs-hydrate mismatch (SSR: no icon; client: warning icon).

The general case is the product-card-in-a-dynamic-grid: a card that only receives its `productId` at `fast+interactive` (the grid item is a client-side signal) can never render that prop at SSR today.

The tension raised in review: we must **not** force components to be defensive (loading a prop at every phase in case it's absent). A component _guarantees_ when it consumes a prop — `markdown-content.ts` reads `props.markdown` at slow (`withSlowlyRender` only), `markdown-live.ts` reads it at fast and as a signal at interactive (`withFastRender` + `withInteractive`, no slow). The runtime must uphold that guarantee, not undermine it.

## Questions & Answers

**Q1: Per-prop phase or per-component phase?**

A1: **Per-prop.** More flexible and already how the contract models it (DL#152 — `phase` is on each `ContractProp`, not the component). A component can legitimately take a `slow` config prop (available at build) _and_ a `fast+interactive` data prop (changes on the client) at once — e.g. a product card with a slow `layout` and an interactive `productId`. Per-component phase can't express that.

**Q2: What are the exact per-prop semantics? (refines DL#152's `fast === fast+interactive`)**

A2: Three levels, differing in _when the value is available_ and _whether it changes_. Crucially, **at the interactive phase every prop is a signal** (`() => T`) — matching client-only Jay (Background) and OQ3 — so the consuming side always sees the same shape; the only difference is whether that signal's value ever changes:

| Prop phase         | Resolved at    | At slow          | Available in (same value) | At interactive it is…              | Binding source may be          |
| ------------------ | -------------- | ---------------- | ------------------------- | ---------------------------------- | ------------------------------ |
| `slow` (default)   | slow (build)   | present          | slow, fast, interactive   | a signal `() => T`, constant value | literal / route param / `slow` |
| `fast`             | fast (request) | `undefined`/`''` | fast, interactive         | a signal `() => T`, constant value | above + `fast`                 |
| `fast+interactive` | fast (initial) | `undefined`/`''` | fast, interactive         | a **reactive** signal `() => T`    | above + `fast+interactive`     |

Two consequences to state plainly:

- A `fast` / `fast+interactive` prop is **`undefined` (or `''` for a string binding) at the slow phase** — it isn't resolvable yet. Components must not read such a prop in `slowlyRender` (Q3/Q5).
- Even a `fast` prop is a **signal at interactive** — it just never fires a change. Uniform shape beats special-casing (OQ3).

This is a strict refinement of DL#152, not a contradiction: DL#152's ordering `slow < fast ≤ fast+interactive` still holds for the validation rule; we split the `≤` into "constant" (`fast`) vs. "reactive" (`fast+interactive`).

**Q3: How does a component "declare" which phase it consumes a prop?**

A3: It already does, two ways:

- The **contract** declares each prop's `phase` (DL#152) — the authoritative source for resolution timing and validation.
- The **`.ts`** declares it structurally by which render functions it implements (`markdown-content` = slow-only, reads `props.markdown` at slow → its props are all `slow`; `markdown-live` = fast + interactive, reads `props.markdown` at fast and `props.markdown()` at interactive → `markdown` is `fast+interactive`).

The framework does **not** enforce this pairing with generated per-phase prop _types_ (Q5): the prop type stays a single in-code declaration, and it's the author's responsibility (backed by validation and documentation) not to read a `fast`/`fast+interactive` prop in `slowlyRender`, where it is `undefined`.

For **Tier 2 (DL#187)** there is no `.ts`; props ≡ tags (DL#187 consistency rule), so **prop phase = the matching tag's phase**, and the synthetic passthrough echoes per phase.

**Q4: What is the runtime change?**

A4: Resolve bindings **at each phase against that phase's merged ViewState**, keeping the raw binding text alive across phases:

- **slow:** resolve only `slow` props (scope = slow VS). Fast / interactive props are absent here — and their _types_ keep them out of `slowlyRender`.
- **fast:** resolve `slow` + `fast` (+ `fast+interactive` initial) props (scope = merged slow+fast VS). This is the fix for the SSR case.
- **interactive (client):** `fast+interactive` props are wired as reactive references to the parent's interactive ViewState field — this path already exists in the compiled client prop getter (`status: vs.currentStatus`, no coercion for dynamic bindings). Only the server phases need new work.

Concretely: `instancePhaseData.discovered[]` must store **raw** props (binding text), not slow-resolved literals, so `fast-changing-runner` can re-resolve `fast` props from the raw binding against the fast scope instead of re-normalizing a dead `""`.

**Q5: Do we generate per-phase prop _types_ in the builder (`SlowProps`/`FastProps`/`InteractiveProps`)?**

A5: **No.** Checked against the code: the builder does **not** generate the props type from the contract — the component author declares it in-place in the `.ts` (`markdown-live.ts`: `.withProps<MarkdownLiveProps>()` with a locally-declared `interface MarkdownLiveProps { markdown: string }`; the interactive signature separately types `markdown` as `() => string`). Forcing authors to declare three interfaces instead of one would make the syntax markedly more complex for little gain.

**Decision: keep the single, in-code `PropsT` unchanged** (as today), and simply state the contract:

> A prop marked `fast` or `fast+interactive` is `undefined` (or `''` for a string binding) during the `slow` phase.

The author already signals _when_ they consume a prop by which render functions they implement, so the single type plus this documented rule is sufficient — a slow-only component never reads a fast prop; a fast/interactive component reads it only where it's defined. The existing interactive convention (props as signals, from client-only Jay — Background) is unchanged: at interactive, the author types props as `() => T`, exactly as `markdown-live` does today.

This removes the largest blast radius from the original draft: no changes to `jay-stack-builder.ts` / `jay-stack-types.ts` render signatures, no per-phase prop codegen in `contract-compiler.ts`. The whole solution reduces to **runtime resolution timing** (Q4) plus **validation** (Q6).

**Q6: Does the compile-time validation (DL#152) still apply / change?**

A6: The rule (source phase ≤ prop phase) is unchanged and stays. Two gaps to close: (a) DL#152's validator collapsed `fast`/`fast+interactive` — it should distinguish them so a `fast` (constant) prop bound to a `fast+interactive` (changing) source is flagged (a constant can't track a value that changes on the client). (b) The check lives only in `jay-stack validate`; the **dev-server build should surface the same error** so mismatches don't silently render `""` in `jay start` (prevention-first).

**Q7: What about `withProps<PageProps>()` on page components (not contract-driven)?**

A7: Page props (`language`, `url`, route params, `query`, `cookies`) are request-time inputs — effectively `fast`, and always available at fast (route params always-available per DL#152 A6). Pages have no _usage-site binding_ to phase-check; this log's per-phase split targets **headless/Tier-2 instance props** driven by contract phases. Page `withProps` keeps its current single-type shape. **Open question OQ1** covers whether to unify later.

**Q8: Backward compatibility?**

A8: Not preserved (experimental framework, per CLAUDE.md). Props default to `slow`, so existing contracts are unaffected in behavior; existing single-`PropsT` `.ts` components keep compiling because `SlowProps ⊆ FastProps ⊆` the old `PropsT` for all-slow contracts. Components that _were_ silently receiving `""` for a fast binding will now either resolve correctly (if declared `fast`/`fast+interactive`) or fail validation (if declared `slow`).

## Design

### Contract — unchanged

`ContractProp.phase` already exists (DL#152). No schema change. Tier 2 inherits phase from the matching tag (DL#187).

### Runtime — per-phase resolution

```mermaid
flowchart LR
  subgraph slow[slow render]
    A[raw instance props] -->|resolve phase=slow only<br/>scope: slow VS| SR[slow props]
  end
  subgraph fast[fast render]
    A -->|resolve phase≤fast<br/>scope: slow+fast VS| FR[fast props]
  end
  subgraph client[interactive - client]
    P[parent interactive VS] -->|signal ref<br/>compiled prop getter| IR[fast+interactive props as ()=>T]
  end
  SR --> SSR[(SSR HTML)]
  FR --> SSR
  IR --> H[(hydrate)]
```

Changes:

1. `InstancePhaseData.discovered[]` stores **raw** props (binding text) + the resolved slow subset — not slow-resolved literals for everything.
2. `slowRenderInstances` resolves only `slow`-phase props (scope = slow VS).
3. `renderFastChangingData` re-resolves `fast` / `fast+interactive` props from raw bindings against `{...slow, ...fast}` (the merged scope it already builds at `fast-changing-runner.ts:100`).
4. Tier 2 passthrough (DL#187) is synthesized per phase (already the DL#187 plan) — it now echoes the phase-correct resolved props.

### Builder — unchanged (single in-code prop type)

No change to `jay-stack-builder.ts` / `jay-stack-types.ts` render signatures and no per-phase prop codegen (Q5). The author keeps declaring one `PropsT` via `.withProps<T>()`. The documented contract is: **`fast` / `fast+interactive` props are `undefined`/`''` at the slow phase**, and at interactive all props are signals (`() => T`), reactive only for `fast+interactive`. This matches client-only Jay's existing interactive-props-as-signals behavior (Background).

### Validation — complete DL#152

Distinguish `fast` vs `fast+interactive` in the phase-order check, and run it in the dev-server build path, not only `jay-stack validate`.

## Implementation Plan

### Phase 1 — Runtime per-phase resolution (fixes SSR)

- `resolve-instance-props.ts`, `instance-slow-render.ts`, `fast-changing-runner.ts`, `dev-server.ts` (and the production parts path): carry **raw** props; resolve slow-only at slow, fast/interactive at fast against the merged slow+fast scope. Verify the Tier 2 badge renders `badge--warning` at SSR for a `fast+interactive` binding.

### Phase 2 — Validation completion

- Split `fast`/`fast+interactive` in the DL#152 check (`validate.ts`); surface it in the dev-server build (not only `jay-stack validate`). Clear message on a constant (`slow`/`fast`) prop bound to a `fast+interactive` (changing) source.

### Phase 3 — Tests

- Compiler: server/element/hydrate fixtures for a `fast+interactive` instance binding (extend `page-with-structural-badge`).
- Smoke: the dynamic badge asserts SSR `badge--warning` + `[!]` (the currently-failing assertions become correct once Phase 1 lands).

### Phase 4 — Docs

- Plugin + designer agent-kit: the three-level prop table, the "declare the phase you consume the prop" guidance, and the explicit rule that `fast`/`fast+interactive` props are `undefined` at slow; note all props arrive as signals at interactive (reactive only for `fast+interactive`).

## Examples

**✅ fast+interactive prop → SSR + reactive client (target):**

```html
<jay:badge status="{currentStatus}" label="Dynamic" count="7" featured="false" />
```

`currentStatus` (`fast+interactive`) → resolved at fast for SSR (`badge--warning`), a signal at interactive (cycles on click).

**✅ slow prop (unchanged):**

```html
<jay:markdown-content markdown="{article.body}" />
```

`article.body` slow → resolved at build, constant.

**❌ constant prop bound to a changing source (validation error, Phase 3):**

```html
<!-- markdown-content consumes `markdown` at slow; cannot track an interactive source -->
<jay:markdown-content markdown="{liveDraft}" />
<!-- liveDraft: fast+interactive -->
```

## Trade-offs

| Approach                                                          | Pro                                                                                                                                                                  | Con                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-phase resolution, single in-code prop type (chosen)           | Fixes SSR/hydrate mismatch; completes DL#152; small blast radius (runtime + validation only); no builder/codegen changes; keeps the simple one-type authoring syntax | The single type can't statically stop an author reading a `fast` prop at slow — caught by convention + validation + docs, not the type checker |
| Per-phase prop types (`SlowProps`/`FastProps`/`InteractiveProps`) | Type checker prevents reading a fast prop at slow                                                                                                                    | Forces three interface declarations per component; large blast radius (builder, types, codegen); rejected as too complex for the gain (Q5)     |
| Document-only: forbid fast/interactive instance bindings          | Zero runtime change                                                                                                                                                  | Kills the product-card-in-grid case; DL#152 already allows these bindings                                                                      |

## Verification Criteria

1. A `fast+interactive` instance prop bound to a `fast+interactive` page tag renders the correct value at **SSR** (no `""`), matching what the client hydrates to (no mismatch).
2. A `fast` prop bound to a `fast` tag resolves at the fast phase (not `""` from slow).
3. A `slow` prop still resolves at build; behavior unchanged for all-slow contracts.
4. The prop type stays a single in-code declaration — no `SlowProps`/`FastProps`/`InteractiveProps` are generated; render signatures in `jay-stack-types.ts` are unchanged.
5. A constant (`slow`/`fast`) prop bound to a `fast+interactive` source fails validation with a clear message, surfaced in the dev build (not only `jay-stack validate`).
6. Tier 2 (DL#187) passthrough echoes phase-correct props at every phase, inheriting phase from the matching tag.
7. `markdown-content` (slow) and `markdown-live` (fast+interactive) compile and behave unchanged.

## Open Questions (resolved)

- **OQ1 — resolved:** Do **not** change the prop type for components or pages. Both keep the single in-code prop type; page `withProps<PageProps>()` is unaffected (request-time inputs, effectively `fast`, always available at fast).
- **OQ2 — resolved:** No extra server→client contract needed. Client-side interactive resolution already works via the compiled prop getter, and that path is in fact _safer_ — it keeps the client consistent and resilient. Fast-phase resolution (Phase 1) is sufficient to seed hydrate; "if it works, it works."
- **OQ3 — resolved:** Props are **always** signals at the interactive phase (reactive only for `fast+interactive`; a constant-valued signal for `slow`/`fast`). Uniformity is simpler for the consuming side — no branching on whether a given prop is a value or a signal.

## Implementation Results

All 7 verification criteria met. Phases 1–4 landed.

### Phase 1 — Runtime per-phase resolution

- Added `normalizeInstancePropNames()` to `stack-server-runtime/lib/resolve-instance-props.ts` — normalizes prop names against the contract (case-insensitive) but keeps binding **values raw** (unresolved). This is the key change: `instancePhaseData.discovered[].props` now stores raw bindings instead of slow-resolved literals.
- Both slow-render paths were updated to store raw props via `normalizeInstancePropNames`:
  - `instance-slow-render.ts` (`slowRenderInstances` — pre-render / direct / production-build). The slow _render call itself_ still receives resolved props (`normalizeAndResolveInstanceProps`); only the `discovered[]` handoff carries raw bindings.
  - `slowly-changing-runner.ts` (`DevSlowlyChangingPhase.runSlowlyForPage` — dev + production build).
  - `dev-server.ts` fallback path builds `rawProps` with `normalizeInstancePropNames`.
- `fast-changing-runner.ts` needed **no change** — it already re-resolved `instance.props` against the merged `{...mergedSlowViewState, ...fastViewState}` scope; that call now works because the props reaching it are raw.
- **Deviation (found during impl):** the SSR variant class was still missing after the fast re-resolution worked, because the compiler-jay-html enum coercion for reverse-mapped numeric enum values wasn't in `dist`. Fixed by rebuilding the compiler chain (compiler-jay-html → compiler → vite-plugin → rollup-plugin → cli → stack-cli). This coercion (`typeof (Status)[field] === 'number' ? (Status)[field] : Number(field)`) is a prerequisite for criterion #1, not new code from this DL.

### Phase 2 — Validation completion

- **Deviation from plan:** the `fast` vs `fast+interactive` split in the phase-order check was **already present** in `validate.ts` (`PHASE_ORDER = { slow: 0, fast: 1, 'fast+interactive': 2 }`, check `sourceOrder > propOrder`) — DL#152 had already shipped this half. No change needed there.
- Real work was **structural (Tier 2) prop-phase resolution**: for Tier 2 structural imports (props ≡ tags, DL#187) the parser defaults all prop `phase` to `slow` while the tags carry the real phase. `checkHeadlessInstanceProps` now reads the effective prop phase from the matching tag when `imp.structural`:
  ```ts
  const propPhase = imp.structural
    ? (resolveContractTag(contract, contractProp.name)?.phase ?? contractProp.phase ?? 'slow')
    : (contractProp.phase ?? 'slow');
  ```
  Without this, every Tier 2 fast/interactive binding was a false-positive error.
- **Surfacing in dev/build (criterion #5):** added `surfaceValidationIssues(projectPath, { verbose })` to `run-validate.ts`, called from `runBuild` (exits on `false`) and `runDev` (advisory, keeps serving).
  - **Deviation / gotcha:** the original design routed the exit through a `fatal` boolean parameter (`if (options.fatal) process.exit(1)` inside the function). Rollup's constant-propagation over that parameter **dead-code-eliminated the `process.exit(1)` branch** in the vite lib build, silently disabling the build gate (bundle printed the error but exited 0). Fixed by having `surfaceValidationIssues` **return a boolean** and letting each caller decide — `runBuild` does `if (!valid) process.exit(1)` at a real call site Rollup can't fold. Verified in the bundled `dist/index.js` and end-to-end (build exits 1 on a deliberate mismatch, 0 on a clean project).

### Phase 3 — Tests

- `stack-server-runtime/test/slow-render-instances-bindings.test.ts` — updated to assert `discovered[].props` holds **raw** bindings (`{ productId: '{p._id}', ... }`), the correct new behavior.
- `stack-cli/test/validate.test.ts` — added `structural (Tier 2) prop phase from tag (DL#189)` describe block (3 tests): no-warn for fast+interactive→fast+interactive, warns for fast+interactive→fast constant prop, keeps declared prop phase for non-structural. Full suite 71/71.
- Smoke (`examples/jay-stack/smoke-test`): the dynamic badge (`status` = `fast+interactive`) asserts SSR `badge--warning` + `[!]`. 61/61 passing.

### Phase 4 — Docs

- `agent-kit-template/plugin/contracts-guide.md` — added the three-level prop-phase table under **Props**, the "declare the phase you consume the prop" rule, and the "undefined at slow / signals at interactive" rules.
- `agent-kit-template/designer/contracts-and-plugins.md` — added the "prop phase must cover the binding source" rules for jay-html bindings (which mismatches error and why).

### Incidental fixes

- `packages/plugins/ui-kit/lib/clipboard-copy.jay-contract` — declared `text` prop `phase: fast+interactive` (was a latent mismatch surfaced once the validation ran in the build path). All three jay-stack examples validate with 0 errors.

### Verification against criteria

1. ✅ SSR renders the `fast+interactive` badge value (`badge--warning`) matching hydrate — smoke 61/61.
2. ✅ `fast` prop resolves at fast (raw binding re-resolved against merged scope).
3. ✅ `slow` props unchanged; all-slow contracts unaffected.
4. ✅ Single in-code `PropsT`; no per-phase prop codegen; `jay-stack-types.ts` unchanged.
5. ✅ Constant prop bound to a changing source fails validation, surfaced in the build (exit 1) — verified with a deliberate mismatch.
6. ✅ Tier 2 passthrough echoes phase-correct props (structural prop phase read from tag).
7. ✅ `markdown-content` / `markdown-live` compile and behave unchanged.
