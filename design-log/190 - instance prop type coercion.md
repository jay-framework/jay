# DL#190 — Instance prop type coercion (server-side)

## Background

Headless instances (`<jay:contract .../>` usage sites) receive their props from HTML
attributes — static (`count="42"`) or bound (`status="{currentStatus}"`). On the server these
are resolved by `resolve-instance-props.ts`:

- `resolvePropBinding(value, scope)` → `String(resolved)`
- `normalizeInstancePropNames` / `normalizeAndResolveInstanceProps` → `String(value)`

Every value is stringified — correct at the transport layer (attributes are strings) but wrong at
the point the value is delivered to a component that declares a typed prop.

## Problem

The stringified props are handed **verbatim** to every instance component's render, for both tiers:

- `fast-changing-runner.ts:98` → `comp.compDefinition.fastRender(instanceProps, ...)`
- `slowly-changing-runner.ts` / `instance-slow-render.ts` → same shape.

`comp` is resolved by contract name regardless of tier. So a component whose contract declares
`count: number`, `featured: boolean`, or an `enum` prop receives `"42"` / `"false"` / `"1"` at
`slowlyRender` / `fastRender`. This is a **pre-existing bug affecting code-backed (Tier 3)
instances too**, not only Tier 2 passthrough.

Concrete failure surfaced by the DL#187 smoke-test badge (Tier 2, pure passthrough — no `.ts` to
launder the value):

- Serialized `__headlessInstances` ships `status:"1"`, `count:"7"`, `featured:"false"` — untyped
  and inconsistent (a literal enum attribute serializes as its member-name string `"success"`,
  while a `{binding}` to an enum value serializes as the stringified number `"1"`).
- The SSR server-element codegen coerces inline, so the **SSR DOM** is correct (one icon, no
  `FEATURED` span for `featured=false`).
- The **client hydrate** reads the raw serialized ViewState directly
  (`headless-instance-context.ts:190` returns `resolvedFastVS`), so `featured:"false"` is a truthy
  string → the client tries to adopt the `featured`-gated coordinate the SSR DOM never rendered →
  `[jay hydration] adoptBase coordinate "S3/0/5" not found in DOM` → fallback fresh render →
  duplicate/constant badge.

Why it stayed hidden: it's **server-side only** (the client propsFactory emits typed literals /
typed ViewState reads), and existing instance props were mostly strings or laundered by author
code. Tier 2 is the first case that pipes a raw prop straight into `status === Status.warning` /
`if featured` with no `.ts` in between.

DL#187 (lines 113–127) already flagged this and pointed at the fix: *"drive coercion off the
contract's declared `dataType` instead of a text-shape heuristic … worth its own design log."* This
is that log.

## Questions & Answers

**Q1. Coerce at the passthrough only, or generalize?**
Generalize. The bug is in the shared instance-prop resolution, not in the passthrough. Coercing
only in `makePassthroughInstanceComponent` leaves the identical bug live for every code-backed
instance with a non-string prop. (User decision: generalize to all instances.)

**Q2. Where is the single coercion point?**
`normalizeAndResolveInstanceProps` in `resolve-instance-props.ts` — it already receives
`contractProps` (each with `dataType`) and is the one function that produces *resolved* values.
`normalizeInstancePropNames` must stay string-only: per DL#189 it deliberately preserves the raw
`{binding}` text for the slow phase so the fast phase can re-resolve; there is nothing to coerce
until a value is resolved.

**Q3. What are the coercion semantics?**
Two parts (user framing):
1. **Reading from the DOM/attributes** — parse each resolved string value against its declared prop
   type.
2. **Serializing SSR → hydrate** — JSON natively carries `string` / `number` / `boolean`, so the
   parsed value serializes as-is. The one design decision is **enums serialize as their numeric
   value** (not the member-name string). This is also what the generated element code compares
   against (`vs.status === Status.success`, where `Status.success` is `0`), so SSR DOM, serialized
   ViewState, and client hydrate all agree.

Attribute-sourced prop types are `string | number | boolean | enum`, so a coerced *string* value is
always one of `string | number | boolean`. Props **bound to an object/array** from a higher
component/page (Q8) arrive already typed and pass through untouched, so the resolved value is one of
`string | number | boolean | object` overall. Semantics (identical to the compiler's
`structural-coercions.ts`):
- `enum` → member-name string maps to its numeric value by declaration order; an already-numeric
  value (possibly stringified) passes through as a number.
- `number` → `Number(value)`.
- `boolean` → `true` only for `true` / `'true'`.
- `string` → unchanged.
- Empty string `''` (unresolved binding — DL#189 keeps a not-yet-resolvable fast/interactive prop
  absent at slow) → left as `''`, **not** coerced (guards against `Number('') === 0` /
  `enum('') → 0` silently defaulting to the first member). `undefined` / `null` also pass through
  untouched.

**Q4. Does this make the SSR-codegen and client-codegen coercions redundant?**
Yes. Once the serialized `__headlessInstances` is typed:
- the SSR server-element inline coercion becomes idempotent (kept as harmless defense-in-depth, or
  removed for cleanliness — see Q5);
- the client hydrate reads typed values directly — no codegen coercion needed;
- the client-element passthrough-comp coercion (added while diagnosing this bug) operates on
  already-typed propsFactory output — idempotent.

**Q5. Remove the now-redundant codegen coercions?**
Keep the compiler `structural-coercions.ts` codegen for now (idempotent, already tested, and it
guards the SSR DOM even if a future non-passthrough path skips runtime coercion). Revisit removal
once the runtime coercion is proven the single source. State this explicitly rather than silently
leaving two coercion sites.

**Q6. Return type change?**
`normalizeAndResolveInstanceProps` currently returns `Record<string, string>`; it becomes
`Record<string, string | number | boolean | object>` — the primitive prop types coerce to
`string | number | boolean`, and object/array bound props (Q8) pass through as `object`. Still
tighter than `unknown` and expresses intent (a coerced primitive, or a passed-through object/array).
Callers spread it into the props object passed to render — no call site depends on the string-ness of
the values.

**Q7. Does the interactive-update bug (button cycle doesn't update the badge) belong here?**
No. That is a client-side reactivity question (does the passthrough comp's `render` reactively
track `_props`), independent of server-side prop typing. Tracked separately; out of scope for this
log.

**Q8. What about props bound to an object/array from a higher component/page?**
A prop can be bound to a page/parent value that is an **object or array** (e.g. `data="{p.items}"`).
Those already work end-to-end: the binding delivers the actual object/array value (not a string),
and JSON serialization carries objects/arrays natively into `__headlessInstances`. Two constraints
this imposes on the fix:
1. `resolvePropBinding` currently returns `String(resolved)` — that would flatten a bound object to
   `"[object Object]"` / an array to a CSV. It must return the resolved value **as-is** so
   object/array (and already-typed number/boolean/enum-number) bindings survive. Only a literal
   (non-`{…}`) attribute stays a raw string.
2. `coerceInstancePropValue` must be a no-op for any **non-string** input — a value that arrived
   already typed (object, array, number, boolean) is passed straight through; only a resolved
   *string* (a literal attribute, or a binding that resolved to a string) is coerced against its
   declared `dataType`.
This widens the coerced return type to include objects/arrays (see Q6).

## Design

Add a shared coercion helper and apply it at the single resolution point.

```ts
// resolve-instance-props.ts (or a small shared module it and the passthrough both import)
export function coerceInstancePropValue(
    value: unknown,
    dataType?: JayType,
): string | number | boolean | object {
    // Non-string values (object/array/number/boolean bound from a higher component/page, Q8)
    // arrive already typed — pass through. Unresolved binding (DL#189, '') or no declared type
    // → leave the raw string untouched.
    if (typeof value !== 'string' || value === '' || !dataType) return value as any;
    if (isEnumType(dataType)) {
        const i = dataType.values.indexOf(value); // member name → numeric enum value
        if (i >= 0) return i;
        const n = Number(value); // already-numeric (possibly stringified) enum value
        return Number.isNaN(n) ? value : n;
    }
    if (dataType.name === 'number') return Number(value);
    if (dataType.name === 'boolean') return value === 'true';
    return value; // string
}
```

Coercion only touches *resolved strings*; anything already typed (object/array from a binding, or a
number/boolean the binding resolved to) passes through. The `value === ''` guard preserves DL#189's
"absent at slow" behavior instead of collapsing to `0` / the first enum member.

`resolvePropBinding` must stop `String(resolved)`-ing its result (Q8) — a `{binding}` that resolves
to an object/array/number/boolean now returns that value as-is; a literal (non-`{…}`) attribute still
returns its raw string, and an unresolved/null binding still returns `''`. Its return type becomes
`unknown`.

`normalizeAndResolveInstanceProps` matches each key to its `contractProps` entry (it already does,
to normalize the name) and runs the resolved value through `coerceInstancePropValue(v, prop.dataType)`.
Note it must **not** `String(value)` the incoming attribute before resolving — the incoming
`instanceProps` value is the raw attribute text (a string like `"{p.items}"` or `"42"`), which is
already a string, so the wrap is a no-op today; but it's dropped to keep the "no stringification"
invariant explicit.

`makePassthroughInstanceComponent` then no longer needs its own coercion — it can drop back to a
plain per-phase pick, because the props it receives are already typed. (Its `PassthroughTag.dataType`
plumbing added during diagnosis can be reverted, keeping the runtime helper as the one source. Note:
production-build persists `structuralTags` to `page-parts.json`; if the passthrough keeps coercion,
`dataType` must be serialized — if we centralize in `normalizeAndResolveInstanceProps` instead, the
passthrough needs no `dataType` and the serialization stays name+phase only.)

Flow after fix:

```
attribute string ─▶ normalizeAndResolveInstanceProps (resolve + coerce by contract dataType)
                     │
                     ├─▶ slowlyRender/fastRender(props: typed)  ── code-backed & passthrough alike
                     └─▶ instanceViewStates[coord] = typed  ─▶ __headlessInstances (typed JSON)
                                                                 ├─▶ SSR DOM (codegen coercion now idempotent)
                                                                 └─▶ client hydrate (reads typed → matches DOM)
```

## Implementation Plan

1. Add `coerceInstancePropValue(value, dataType)` (drives off `JayType` — `isEnumType` + `values`,
   else `name`; no-op for non-string input per Q8), colocated with `resolve-instance-props.ts`.
2. Stop stringifying in the resolver (Q8): `resolvePropBinding` returns the resolved value as-is
   (return type `unknown`), and `normalizeAndResolveInstanceProps` drops the `String(value)` wrap.
   Apply `coerceInstancePropValue` inside `normalizeAndResolveInstanceProps` per resolved key using
   the matched `contractProps[].dataType`; change its return type to
   `Record<string, string | number | boolean | object>`.
3. Revert the passthrough-scoped coercion in `makePassthroughInstanceComponent` back to a plain
   per-phase pick (single source of coercion), and revert the `dataType` plumbing in the three
   callers + the `structuralTags` type (name+phase only again).
4. Keep the compiler `structural-coercions.ts` codegen (idempotent) per Q5.
5. Tests:
   - Unit: `resolve-instance-props` coerces number/boolean/enum (member-name and stringified-number),
     leaves strings/`undefined`/`''` alone, and passes a bound object/array through unchanged (Q8).
   - **Dev-server hydration fixtures — one per tier** (user request). The existing `5*`/`8*`
     fixtures never pass a non-string prop (they pass a string `itemId`; number/enum tags are
     computed by the component's own `.ts`), so neither the bug nor the fix is covered today. Add:
     - **Tier 3 (code-backed instance):** a widget whose contract declares `count: number`,
       `active: boolean`, and a `status: enum` **prop**, bound both statically (`count="7"`) and via
       `{binding}` from page fast ViewState. The widget's `.ts` renders an `if status === …`
       conditional and an `if active` element so an uncoerced string prop produces an
       SSR/hydrate mismatch. Assertions: SSR structure correct; `no hydration warnings` (the harness
       already asserts no `[jay hydration]` — catches the `adoptBase … not found` regression);
       `__headlessInstances` ViewState typed via the automation API.
     - **Tier 2 (pure headfull, no `.ts`):** the first Tier 2 dev-server hydration fixture — a
       badge-style contract+jay-html with enum/number/boolean props, static + `{binding}`, driving
       own-template `if status === …` / `if featured` conditionals. Same assertions. (Mirrors the
       smoke-test badge but inside the Playwright hydration harness that actually exercises adopt.)
   - Smoke test: dynamic badge SSR + serialized `__headlessInstances` now typed; hydrate has no
     `adoptBase … not found`.

## Verification Criteria

1. A code-backed Tier 3 instance whose contract declares `count: number` / `featured: boolean` /
   an enum prop receives the typed value (not a string) at `slowlyRender`/`fastRender`.
2. Serialized `__headlessInstances` carries typed values (`count: 7`, `featured: false`,
   `status: 1`) — consistent whether the source was a literal attribute or a `{binding}`.
3. Client hydration of the DL#187 badge produces no `adoptBase coordinate … not found` and a single
   icon per badge, matching SSR.
4. DL#189 behavior preserved: fast/interactive props still absent (`undefined`) at slow, not coerced
   from an empty string.
5b. A prop bound to a page/parent **object or array** (`data="{p.items}"`) reaches the instance as
   the real object/array (not `"[object Object]"`), and serializes into `__headlessInstances` as
   JSON — unchanged from today.
5. Full compiler-jay-html + stack-server-runtime suites and the smoke test pass.
6. New dev-server hydration fixtures — one Tier 2 (pure headfull) and one Tier 3 (code-backed
   instance), each passing number/boolean/enum props (static + `{binding}`) — pass with no
   `[jay hydration]` warnings and typed `__headlessInstances`.

## Implementation Results

Implemented as designed. Single-source coercion lives in `resolve-instance-props.ts`
(`coerceInstancePropValue` + a no-longer-stringifying `resolvePropBinding`), applied inside
`normalizeAndResolveInstanceProps` and the forEach path in `fast-changing-runner.ts`. The
passthrough component reverted to a plain per-phase pick, and the `dataType` plumbing added during
diagnosis was reverted across `load-page-parts.ts`, both `load-production-parts.ts`, and the
`structuralTags` types (name+phase only). The compiler `structural-coercions.ts` codegen was kept
(Q5). Object/array bindings pass through untouched (Q8).

### Deviations — compiler bugs surfaced by the typed-prop fixtures

All were pre-existing, blocked the canonical DL#190 pattern (an enum prop echoed to a same-named
enum tag), and were fixed in `compiler-jay-html` rather than worked around:

1. **Bare-specifier contract-enum import** (`jay-target/jay-html-parser.ts`). When a headless
   instance passes an enum prop, the client bootstrap emits `status: Status.warning` and imports the
   enum from the instance's contract. The contract module path (`relativeContractPath`, and the
   parallel `declaringModule` used to match it) was computed with `path.relative(...)` but — unlike
   the component-module path 48 lines above — skipped the `./`-prefix guard, so a same-dir /
   plugin-resolved contract became a bare `widget.jay-contract` specifier the bundler couldn't
   resolve. Only surfaced with an enum (a type-only contract import is stripped by esbuild, so 5a et
   al. never hit it; 8n avoided it with a `../`-prefixed contract path). Fixed by routing both
   through a `toRelativeModule` helper that applies the same guard.

2. **Duplicate `export enum` in generated contract types** (`contract/contract-compiler.ts`). A
   contract declaring an enum as both a prop and a same-named tag emitted the enum twice (once from
   the ViewState section, once from the props section) — a duplicate-identifier TS error.
   `generatePropsInterface` now skips enums already declared by the ViewState section. The set of
   already-declared enum names is collected structurally by `collectViewStateEnumNames`, which walks
   the same `JayType` tree `generateTypes` renders (descending object `.props` and array/promise
   `.itemType`, adding `type.name` on `isEnumType`) — not by scraping `export enum` out of the
   rendered `fullViewStateTypes` text, which would silently miss renames of the enum keyword or
   formatting changes. Harmless at runtime (the enum IIFE merges) but broke `tsc` over the fixture
   `.d.ts`.

3. **Bare-specifier contract import for structural (Tier 2) headfull-FS instances** (a *second*
   occurrence of bug #1, in the headfull-FS branch of `jay-html-parser.ts`, distinct from the
   plugin/headless branch). Its `relativeContractPath` / enum `declaringModule` were also computed
   with a bare `path.relative(...)`, so a subdir contract (`./badge/badge.jay-contract`) emitted as
   `badge/badge.jay-contract` — unresolvable. Fixed with the same `toRelativeModule` guard.

4. **Redundant, ill-typed client-side coercion in the structural passthrough `comp`**
   (`jay-target/structural-coercions.ts`, `buildStructuralPassthroughComp`). For a Tier 2 structural
   instance the client element/hydrate targets wrapped the inlined passthrough with a `comp` that
   re-coerced every field at runtime (`Number(_props.count)`, `(Status as any)[_props.status]`,
   `_props.featured === 'true'`). But the client, unlike the server, does **not** receive raw
   attribute strings: its props come from the generated `childComp(...)` factory, which the compiler
   already emits with compile-time coercion (static `status="success"` → `Status.success`, `"42"` →
   `42`, `"true"` → `true`; `{binding}` props carry their source ViewState's type). Re-coercing typed
   values was redundant and did not type-check — indexing an enum by an already-numeric value or a
   `Getter`, `Number()`-ing a typed value — producing `TS2538`/`TS2367` over the fixtures. The client
   passthrough is now a pure identity (`render: () => _props`). The **server** path keeps
   `buildStructuralCoercions`, because SSR genuinely reads raw strings out of `__headlessInstances`.
   This is the coercion asymmetry: **server coerces at runtime, client coerces at compile time**, and
   both converge on typed ViewState (DL#189 lock-step).

### Fixtures

- **Tier 2** — `8n-page-headfull-fs-typed-props` (pure headfull badge). Missing contract `.d.ts`
  files were generated so the package type-checks.
- **Tier 3** — `5g-page-headless-typed-props` (code-backed widget: enum `status`, number `count`,
  boolean `active` props, static + `{binding}` from page fast ViewState; child template gates icons
  on the enum, text on the number, a flag on the boolean). Because Tier 3 client interactivity works,
  the test asserts the post-hydration `__headlessInstances` holds typed values (`count` and numeric
  enum `status` are `number`; `active` boolean gates ACTIVE) via the automation API, plus SSR
  correctness, no `[jay hydration]` warnings, and a working `+1` interaction that keeps `count` numeric.
- **Compiler unit fixture** — `compiler-jay-html/test/fixtures/contracts/page-with-structural-badge`
  (a structural Tier 2 badge with enum/number/boolean props). Its three generated files were
  regenerated after fixes #3/#4 (relative `./badge/badge.jay-contract` import, identity-passthrough
  client `comp`, coercion retained only in the server file), and its missing `badge.jay-contract.d.ts`
  was generated (single `export enum Status` despite the enum being both a prop and a tag — bug #2).

### Test Results

- `stack-server-runtime`: 119/119 pass.
- `compiler-jay-html`: 723/723 pass (4 skipped) — no fixture drift from either compiler fix.
- `compiler-jay-stack` 70/70, `rollup-plugin` 47/47, `cli` 7/7 pass.
- `dev-server` hydration: 709/709 pass (incl. 8n and the new 5g); `build:check-types` clean.
- smoke-test: 61/61 pass (the originally-reported badge `adoptBase … not found` regression).

### Consistency with the secure ViewState serializer

Jay has a second ViewState serialization path — `@jay-framework/secure` (over `@jay-framework/serialization`
+ `@jay-framework/json-patch`) — which serializes ViewState across the sandbox/worker boundary. It was
checked for type-handling consistency with this design; the partial/diff nature (it emits JSON-Patch
deltas because of the interactive sandbox) is expected and out of scope. The **typed wire
representation matches**:

| Type | secure (`json-patch` diff) | DL#190 (`coerceInstancePropValue`) |
|------|----------------------------|-------------------------------------|
| enum | raw runtime value → **number** (`Status.warning` → `1`) | member-name string `"warning"` → **numeric index `1`** |
| number / boolean | raw value | `"42"`→`42`, `"false"`→`false` |
| object / array | preserved (diffed structurally) | preserved (passthrough, no `String()`) |

Enums land as **numbers** on both sides, and the client compares them the same way
(`vs.status === Status.success`, numeric).

The one structural difference is **why** each side is typed, and it is not a divergence:

- secure serializes values that are **already typed** (produced by a component's render/signals in JS),
  so it needs no coercion — only preservation, which `postMessage` structured-clone gives natively.
- DL#190 serializes props that **originate as jay-html attribute strings**, where the type was erased
  by the string encoding; the contract `dataType` is the only way to *recover* it. Coercion exists
  precisely to reach the same typed representation secure already has.

So: secure is runtime-type-driven (its input never lost its type); DL#190 is contract-`dataType`-driven
(its input did). Both converge on identical typed values.

Secondary, also out of scope: transport differs (secure = structured-clone `postMessage`, preserving
exotic types like `Date`/`Map`; DL#190 = JSON in SSR/bootstrap, which would flatten a `Date` to a
string). This is a non-issue for the supported contract type set (all JSON-safe), and secure doesn't
special-case `Date`/`Map`/`Set` either — so there's no capability DL#190 fails to match.