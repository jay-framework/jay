# Design Log #187 — Pure Headfull Components

## Background

DL#111 established nested headfull full-stack components: own `.jay-html`, own `.jay-contract` (bound via `<script type="application/jay-data">`), own `.ts` (`makeJayStackComponent`) providing slow/fast/interactive render functions. DL#162 later asked whether the `.ts` file could be dropped for purely structural components (shared headers, footers, info boxes) — and, after prototyping a props → ViewState passthrough, concluded the answer was "no ViewState at all": a codeless component became a plain template fragment, unwrapped into the parent as static HTML, with any dynamic data coming only from headless imports declared in its own `<head>` — not from the usage site.

DL#84 separately established that nested-component ViewStates are isolated: "Each component (page and nested) has its own ViewState space. Child ViewState is NOT merged into parent" — the only channel from usage site into a nested component is the declared `props`. DL#152 then made that channel phase-safe: a prop's phase must be ≥ the phase of whatever source value is bound to it, checked at compile time.

### Related

- DL#38 — Contract File (`type: variant`, `dataType: enum(...)`)
- DL#45 — View State Types
- DL#51 — jay-html with contract references (`application/jay-data`)
- DL#84 — Headless component props and repeater support (ViewState isolation, props-only channel)
- DL#111 — Nested headfull full-stack components (own contract + own `.ts`, template injection pipeline)
- DL#124 — Contract props and params consistency (attribute-name validation)
- DL#152 — Phase-aware contract props (phase-safety for the props channel)
- DL#162 — Structural headfull components (codeless components, walked back to "no ViewState at all")
- DL#181 — Headfull component override

## Problem

DL#162's conclusion — a codeless component has "no props, no tags, no ViewState," purely a template fragment — is right for pure layout wrappers with nothing designer-configurable (an `InfoBox` whose contract is just `name: InfoBox`). It cannot express a very common, different case: a purely presentational, parameterized, codeless piece of UI whose content and appearance are decided by the usage site — a status badge whose color/icon depends on an enum the caller provides, a banner whose text and image come from the page. That needs real ViewState, driven by usage-site input, with no `.ts` anywhere — which is exactly what DL#162 tried first and discarded, on the reasoning that a template-fragment component shouldn't need one. That reasoning holds for `InfoBox`; it doesn't hold once the contract actually declares data.

Separately: this framework already has three file combinations for a headfull component (jay-html alone; jay-html + contract; jay-html + contract + `.ts`). For an agent authoring components, these need to read as one progressively-capable model, not as unrelated special cases — that consistency is the second thing this log has to get right, not just the new capability itself.

## The three-tier model

| Tier | Files                                 | Builder                                                 | ViewState                                                       | Phases                                   | Interactivity |
| ---- | ------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------- | ------------- |
| 1    | `.jay-html`                           | `makeJayComponent` (existing, DL#111's client-only row) | none                                                            | interactive-only, client-side only       | yes           |
| 2    | `.jay-html` + `.jay-contract`         | auto-generated passthrough (this log)                   | contract `tags`, required identical to contract `props` (Q3/Q9) | slow/fast/interactive, per tag's `phase` | no            |
| 3    | `.jay-html` + `.jay-contract` + `.ts` | `makeJayStackComponent` (DL#111)                        | computed by code from props                                     | slow/fast/interactive, per tag's `phase` | yes           |

Each tier is a strict superset of the previous one, file-wise and capability-wise:

- **Tier 1 → Tier 2** (add a contract): gain full-stack phases and a typed, phase-safe ViewState — but that ViewState can only ever equal what the usage site hands in, since there's no code to transform it.
- **Tier 2 → Tier 3** (add `.ts`): gain the ability to _compute_ ViewState (fetch data, call services, derive values the usage site never supplied) and gain interactivity (refs need code to handle events).

Tier 2 is what DL#162 explored and is what this log completes.

## Questions & Answers

**Q1: Naming.**

A1: **Pure headfull component.** It keeps its own `.jay-html` — by CLAUDE.md's definition that makes it headfull, not headless; "headless" specifically means the usage site supplies the UI, which isn't the case here. "Pure" describes what's missing along the _code_ axis (no `.ts`), independent of the _markup_ axis (headfull/headless) that "pure headless" was accidentally crossing. One name, used consistently for Tier 2 from here on — no "codeless" synonym alongside it, since a single agent-facing vocabulary is exactly what Q2 is asking for.

**Q2: How does this relate to DL#162's structural components — replace them, or something else?**

A2: Same tier, not two separate categories. DL#162's `InfoBox` (`name: InfoBox`, no props, no tags) is Tier 2 with an empty ViewState — it isn't a fundamentally different kind of thing, it's the degenerate case of the same tier: a contract with nothing in `props`/`tags` produces a pure headfull component with nothing to bind, which is indistinguishable in output from a static fragment. DL#162's "unwrap into plain HTML" is best understood as a compiler optimization of that degenerate case, not a separate designer-facing category — an agent authoring a Tier 2 component doesn't need to know or care whether the compiler happens to unwrap it when the contract is empty. This keeps the mental model at exactly three tiers, full stop, with no fourth "sometimes" case.

**Q3: Do `props` and `tags` (ViewState) stay separate, as they are for a Tier 3 component?**

A3 (revised — see Q9 for the full reasoning): both sections are **required** at Tier 2, and the compiler validates they're consistent — same names, same types. A Tier 3 component can legitimately have `props` that differ from its `tags`, because its `.ts` computes ViewState from props (a slow-rendered `navItems` tag might come from a CMS call using a `logoUrl` prop as a cache key, for instance). A Tier 2 component has no code to perform that computation, so its `props` and `tags` are _required_ to describe the same thing — but they still exist as two sections, not one collapsed section. This keeps the contract file's shape identical across Tier 2 and Tier 3 (see Q9): the only thing that changes between tiers is how strictly `props` and `tags` are allowed to diverge, not which sections exist.

**Q4: DL#84 says nested-component ViewStates are isolated and the only channel in is `props`. Doesn't usage-site attribute-to-ViewState binding (Tier 2) break that?**

A4: No, and with the Q9 resolution this needs no special case at all: usage-site attributes bind to `props` at Tier 2 exactly as they do at Tier 3 (DL#84's instance-attribute resolution, DL#152's phase check, unchanged). DL#84's isolation rule bans _ad hoc live references_ from a child's template into the parent's ViewState (you can't write `{parentField}` inside a nested component's template and have it resolve against the parent) — it does not ban the usage site from supplying values through the declared channel. Because `tags` is required to mirror `props` at Tier 2, the template's own bindings (which read `tags`, i.e. ViewState) end up reflecting exactly what the usage site passed in — but that's a consequence of the consistency rule, not a second binding path.

**Q5: "Because of the rendering phases" — is that actually why the channel is restricted to named props/tags rather than free template binding?**

A5: Yes, and DL#152 is the concrete mechanism, not just a rationale. Slow, fast, and interactive phases run at different times (build, request, client) and potentially for different components at different points in a build. A free-form `{parentField}` reference inside a child's template would give the compiler no way to know _when_ that value needs to exist relative to when the child renders. A named, contract-declared prop/tag with a `phase` annotation does: DL#152's rule ("source tag phase must be ≤ prop's phase") is checked once per binding at compile time, regardless of which tier the target component is. So the restriction was never "no data from the usage site" — it was "no binding the compiler can't schedule." Tier 2 components need that guarantee exactly as much as Tier 3 ones; nothing about lacking a `.ts` exempts a `tags: fast` field from needing a `slow`-or-earlier source.

**Q6: Do Tier 2 components support refs and interactivity?**

A6: No — same answer DL#162 already gave and for the same reason: refs exist to let component code handle events, and there is no component code at Tier 2. Interactivity is exactly what Tier 3 adds (see the tier table). Tier 2 components are render-only.

**Q7: Interaction with DL#181 overrides?**

A7: None needed. A Tier 2 component compiles through the same template-injection pipeline as a Tier 3 component (DL#111), so DL#181's `ref`-anchored override mechanism applies identically — override resolution doesn't know or care which tier the target component is.

**Q8: Does this validate that a variant's bound value is actually one of its declared enum values (e.g. `status="typo"` against `enum(success | warning | error)`)?**

A8: Not by this design log — see the dedicated explanation below.

**Q9: Tier 2 reuses the external `.jay-contract` format — but that format also has a `props:` section, so a Tier 2 contract can _look_ like it should declare both `props:` and `tags:`. Should Tier 2 use an embedded/inline `jay-data` block instead, forbid `props:`, or something else?**

A9 (revised): keep the external `.jay-contract` file, **require both `props:` and `tags:`, and validate they're consistent** — same names, same types. This landed differently from the first draft (which forbade `props:` at Tier 2) after weighing what "consistent" should mean across tiers per Q2.

Ruled out first: an embedded/inline `jay-data` block instead of an external contract. DL#51 deliberately decided inline `<script type="application/jay-data">` blocks carry **no phase annotations** — "inline data = no phases, contract reference = phases" was the explicit recommendation, and inline data's ViewState defaults entirely to the interactive phase (DL#51, "Challenge 2"). Tier 2 needs `slow`/`fast` phases, so it can't be built on the inline format as it exists — and that format has no established `variant` tagging either (only ever developed for `.jay-contract`, DL#38).

Ruled out second: forbidding `props:` at Tier 2, tags-only. This works but makes a Tier 2 contract _structurally different_ from a Tier 3 one — an agent (or human) can't tell from the contract's shape alone whether it's looking at a Tier 2 or Tier 3 component; it would have to also check for a `.ts` file. It also reintroduces exactly the kind of tier-dependent schema branching Q2 is asking to avoid.

**Chosen: require both, validate equal.** A `.jay-contract` file always has the same two sections, at every tier, full stop — `props:` (what a caller must supply) and `tags:` (what the template consumes). What changes between tiers isn't the shape of the file, it's how strictly the two are allowed to diverge: at Tier 3, `.ts` code is free to compute `tags` from `props` however it likes (already the norm — DL#124 already requires a Tier 3 contract to fully declare whatever props its `.ts` uses, no omission allowed). At Tier 2, there's no code to create that divergence, so the compiler requires them to match exactly: same names, same types. This is a strictly stronger version of an existing Tier 3 expectation, not a new rule invented for Tier 2.

This has a genuinely good side effect for Phase 1's implementation: **tier is now determined purely by file presence** — no contract, Tier 1; contract, no `.ts`, Tier 2; contract and `.ts`, Tier 3 — never by inspecting the contract's contents (whether it has tags, how many, etc.). That's a cleaner, more robust signal than the tags-presence check the first draft of this log used, and it removes the "silently changes category" trade-off that check had.

Real cost, stated plainly: at Tier 2 this means writing the same field list twice (once as `props`, once as `tags`) for even a trivial component. That's authoring duplication DL#162 was originally trying to avoid — though it's YAML field repetition, not the `.ts` boilerplate DL#162 was actually complaining about, so the cost is much smaller. Worth deciding explicitly rather than by default: acceptable trade for a uniform contract shape across tiers, or should the compiler allow omitting `props:` at Tier 2 and _infer_ it equals `tags:` (same end validation, less typing)?

**Q10: `props:` entries and `tags:` entries don't use the same vocabulary today — a prop's `type:` means something different from a tag's `type:` (data/interactive/variant/sub-contract vs. a data type). "Same names, same types" consistency-checking has to reconcile these, not just diff two lists. Does this log solve that, or is it another flagged gap?**

A10 (checked against the actual generator source, not inferred): the naming mismatch is real but shallower than it looked — a prop's `type` is equivalent to a tag's `dataType`, confirmed directly: both go through the exact same `parseDataType()` function in `contract-parser.ts`, and both accept the identical `enum(a | b | c)` grammar (the `type: enum` + separate `values: [...]` shape from DL#84's original draft was never actually implemented — the shipped parser treats props and tags identically here). So the name-level translation is trivial: prop `type` ↔ tag `dataType`, everything else (`string`, `number`, `boolean`, `enum(...)`) reads the same on both sides already.

But there's a sharper problem underneath the one you raised, worth stating precisely: because props and tags each independently call `parseDataType()`, an enum field declared on both sides generates **two separate nominal TypeScript `enum` blocks** — `contract-compiler.ts`'s `generatePropsInterface()` and `jay-html-compile-types.ts`'s `renderInterface()` both emit `export enum <PascalCase(name)> { member, member, ... }` from the same template, independently. Even when the two declarations are byte-for-byte identical (same members, same casing — confirmed from fixtures: members are bare identifiers using the contract's raw text, not capitalized or string-valued), TypeScript enums are nominally typed: two independently generated `enum Status {...}` blocks are two different types, not interchangeable without a cast, even with identical shape. Worse, since both call the same unscoped `pascalCase(tag)` naming (the exact mechanism DL#122 already flagged as collision-prone across linked contracts), a prop and a tag sharing a field name would each try to emit `export enum Status { ... }` in the same generated file — a duplicate-declaration compile error, not just a type mismatch.

So checking "same name, same type" isn't enough for enums specifically — matching *shape* doesn't give you matching *type identity*. The fix belongs in Phase 3 alongside the consistency check: when a prop and a tag are validated as a consistent enum pair, generate the enum **once** and have both the `XxxProps` interface and the ViewState type reference that single declaration, rather than letting each side's codegen run independently. This turns the Tier-2 consistency check from a pure validation step into one that also drives shared type generation for the enum case — worth calling out explicitly in the implementation plan rather than assuming the existing per-side codegen paths compose correctly on their own.

## Explaining Q8

Two checks exist today (DL#124), and both are about _shape_, not _value_: does the attribute's name exist on the contract, and if the contract marks it required, is it present. Neither checks the _value_ assigned to an enum-typed prop or tag against that enum's declared members. So `<jay:Badge status="success" />` is fully validated; `<jay:Badge status="sucess" />` (typo) or `<jay:Badge status="active" />` (a value that isn't in `success | warning | error` at all, maybe copied from a different contract) compiles cleanly today and only misbehaves at runtime — every `if="{status === '...'}"` branch in the template evaluates false, and the badge silently renders with no icon and no error anywhere pointing at the cause.

This is exactly the kind of thing CLAUDE.md's validation-first principle exists for, and it gets more likely to bite once Tier 2 makes variant-driven components a common, casually-authored pattern (badges, statuses) rather than the occasional hand-rolled Tier 3 case — small string literals typed by hand or by an agent are precisely where typos live.

It wasn't folded into this log's implementation plan for two reasons. First, it isn't specific to Tier 2 — the same gap exists for any enum-typed `prop` on a Tier 3 component today, so it belongs in its own design log scoped to "enum value validation," not bundled into the tier model. Second, the fix splits into two sub-problems of very different difficulty:

- **Static literal** (`status="success"`) — cheap. The compiler already has the literal string in hand at compile time; it just needs to check membership against the contract's declared enum values. This is a small, self-contained addition to DL#124's existing check.
- **Dynamic binding** (`status="{item.state}"`) — harder. This requires proving the _source_ field's enum type is compatible with the _target_'s enum type, potentially across two unrelated contracts from different plugins with no shared vocabulary (`item.state: active | inactive` binding into `status: success | warning | error` is nonsensical, but nothing today traces enum identity across a binding the way DL#152 traces phase). That's real cross-contract type inference, not a name/membership lookup, and is a meaningfully bigger piece of work.

Worth its own design log if you want it addressed — happy to start one; flagging it here rather than solving it inline was the deliberate scope call.

## Explaining the attribute-coercion gap (a second, more fundamental issue than Q8)

Checked directly against the compiler source rather than inferred: `parseComponentPropExpression` (`compiler-jay-html/lib/expressions/expression-compiler.ts`) compiles a static instance attribute via a PEG.js grammar rule (`expression-parser.pegjs`) that has exactly two outcomes — if the entire attribute text is plain non-negative digits, emit a bare numeric literal; otherwise, wrap it as a quoted string. This is a **syntactic** heuristic on the attribute text, not something driven by the contract's declared `dataType`. Concretely, per dataType:

- **`enum`** — actually fine, and not by design so much as by luck: an enum's declared members are themselves strings, so quoting `status="success"` as `'success'` already produces exactly the right TypeScript value. No coercion is needed because there's nothing to coerce.
- **`number`** — fragile, not solved. `count="4"` happens to work (all-digit heuristic). `count="-4"` or `count="4.5"` doesn't — both get wrapped as the string `'-4'` / `'4.5'` despite the contract saying `dataType: number`, with no compiler error pointing at the mismatch.
- **`boolean`** — not handled at all. `active="true"` compiles to the string literal `'true'`, not the boolean `true`. `'true'` is truthy in a loose check but fails `=== true`, so a variant conditional like `if="{active === true}"` silently evaluates false.

There's also a defensive fixup (lines 408-414 of `jay-html-compiler.ts`) that runs in the _opposite_ direction — if a prop is declared `string` but the digit-heuristic already produced a bare number literal, it gets re-quoted. There's no equivalent branch for `number` or `boolean` forcing or validating coercion the other way.

This is a distinct, more fundamental issue than Q8: Q8 is "is the value a member of the enum," this is "does the value even land as the declared JS type at all for non-string dataTypes." It predates and is orthogonal to this log — the same gap exists for any `boolean`/`number` prop on a Tier 3 component today — but Tier 2 makes it far more likely to surface, since a passthrough component with no code has variant-driven booleans and numbers as one of its main reasons to exist, and there's no `.ts` anywhere to work around it with a manual cast.

Your scoping instinct is correct and should be stated as an explicit rule regardless of whether/how the coercion bug gets fixed: **static and dynamically-bound attributes are for primitive scalars — `string`, `number`, `boolean`, `enum` — not objects or arrays.** This isn't a new restriction being imposed; it's already true of the grammar today (there is no object-literal parsing path for a static attribute value at all), so writing it down as a stated contract-authoring rule costs nothing and heads off anyone assuming it works.

Not fixed by this log, for the same reason as Q8 — pre-existing, not Tier-2-specific, and a real compiler fix (drive coercion off the contract's declared `dataType` instead of a text-shape heuristic) rather than a validation rule. Worth its own design log, and given it's a verified bug rather than a gap in coverage, probably a higher-priority one than Q8's.

## Design

### Contract — both `props:` and `tags:`, required consistent

The contract format itself is unchanged (DL#38, DL#84): `props` describes what a caller supplies, `tags` can be `data`, `variant`, or both, with `dataType: enum(...)` or `boolean` for variants. What's new at Tier 2 is a validation rule: every `props` entry must have a same-named, same-typed `tags` entry and vice versa (see Q9/Q10 for the reasoning and the open vocabulary-translation question).

```yaml
# badge.jay-contract
name: Badge
props:
  - name: label
    type: string
    required: true
  - name: status
    type: enum
    values: [success, warning, error]
    required: true

tags:
  - tag: label
    type: data
    dataType: string
    phase: fast
  - tag: status
    type: variant
    dataType: enum(success | warning | error)
    phase: fast
```

```html
<!-- badge.jay-html — no badge.ts anywhere -->
<html>
  <head>
    <script type="application/jay-data" contract="./badge.jay-contract"></script>
  </head>
  <body>
    <span class="badge badge--{status}">
      <svg if="{status === 'success'}" class="icon-check"></svg>
      <svg if="{status === 'warning'}" class="icon-warn"></svg>
      <svg if="{status === 'error'}" class="icon-x"></svg>
      {label}
    </span>
  </body>
</html>
```

### Usage — instance attributes bind directly to tags

```html
<script
  type="application/jay-headfull"
  src="../components/badge/badge"
  contract="../components/badge/badge.jay-contract"
  names="Badge"
></script>

<jay:Badge label="Live" status="success" />
<jay:Badge label="{item.stateLabel}" status="{item.state}" />
```

Static and dynamic (`{expr}`) attributes resolve onto `props`, exactly as DL#84 already defines for any instance prop at Tier 3; DL#152's phase check applies exactly as it already does — `status`'s `phase: fast` requires its source (`item.state`) to be `fast` or earlier. No Tier-specific rule needed here at all (Q4).

### Compiler: auto-generated passthrough at Tier 2

When a headfull import has `contract` but no `.ts` at the resolved `src`, generate the same synthetic definition DL#162 originally prototyped and then removed:

```typescript
makeJayStackComponent<Contract>()
  .withProps<Props>()
  .withFastRender(async (props) => phaseOutput(props, {})); // props and tags validated identical (Q9) — direct passthrough
```

(Or `withSlowlyRender`/mixed, matching whatever phases the contract's tags declare — identity passthrough per phase, no transformation.) When the contract declares zero props/tags, the generated output degenerates to DL#162's existing unwrapped-fragment result (Q2) — same code path, trivial case.

## Implementation Plan

### Phase 1: Tier detection in the parser

**File:** `compiler-jay-html/lib/jay-target/jay-html-parser.ts`, `parseHeadfullFSImports()` / the structural-detection path added in DL#162.

Purely file-presence based (Q9) — no contract-content inspection needed:

1. `contract` absent at the import → Tier 1 (existing `makeJayComponent` path, unchanged).
2. `contract` present, `.ts` missing at `src` → Tier 2: proceed as a headfull FS import (DL#111's `JayHeadlessImports` creation, template injection), marked for synthetic-passthrough codegen rather than a module import.
3. `contract` present, `.ts` present → Tier 3 (existing DL#111 path, unchanged).

### Phase 2: Restore the synthetic passthrough (reinstate DL#162's removed work)

**Files:** `jay-html-compiler.ts`, `load-page-parts.ts`, `load-production-parts.ts`.

DL#162's "Implementation Results" lists exactly what to bring back: synthetic passthrough component generation, props → ViewState identity mapping (direct, since Phase 3's validation guarantees props ≡ tags), inline component generation in the compiler instead of a module import. Verify the empty-props/tags case still degenerates to output equivalent to DL#162's shipped unwrap behavior — this is a regression check, not new behavior.

### Phase 3: Props/tags consistency validation for Tier 2

**File:** `stack-cli/lib/validate.ts` / `plugin-validator/lib/check-component-contract.ts` (DL#124's home for contract-shape checks).

New check, Tier 2 only: every `props` entry has a same-named `tags` entry with a matching `dataType` (prop `type` ↔ tag `dataType`, per Q10 — same vocabulary already, no translation needed) and vice versa. Compile error naming the mismatch, e.g. _"Badge: prop `status` (enum: success, warning, error) has no matching tag"_ or _"Badge: tag `label` (dataType: string) has no matching prop."_ Tier 3 is unaffected — DL#124's existing looser check (props must be declared, no full tags-equality requirement) stays as-is there.

**Enum type sharing (Q10):** for a validated-consistent enum pair, `contract-compiler.ts`'s `generatePropsInterface()` and `jay-html-compile-types.ts`'s `renderInterface()` must not each independently call `parseDataType()`/emit their own `export enum` block — confirmed from source that doing so produces two nominally-distinct (or, when names collide, duplicate-declaration-error) enums from an identical definition. Generate the enum once per Tier 2 contract and have the `XxxProps` interface and the ViewState type both reference it, so the auto-generated passthrough (Phase 2) can assign `props.status` directly into the ViewState without a cast.

### Phase 4: Documentation

Update the Designer agent-kit guide with the three-tier table: when to stop at Tier 1 (pure client-side), when Tier 2 is enough (usage-site-driven content and variant conditionals, no logic — write matching `props`/`tags`), and when Tier 3 is required (computed data, services, interactivity, where they may diverge).

### Phase 5: Smoke test

Add a Tier 2 `Badge` (props + matching tags, with a variant) alongside DL#162's existing Tier-2-degenerate `InfoBox` (empty props + tags) in the smoke-test project, verifying both compile correctly through the same path, and that a deliberately mismatched contract fails Phase 3's validation with a clear error.

## Examples

**✅ Tier 2, parameterized, variant-driven (this log):**

```html
<jay:Badge label="Live" status="success" />
```

**✅ Tier 2, degenerate (empty contract, DL#162's original case, unchanged output):**

```html
<jay:InfoBox />
```

**❌ Tier 2 component trying to reach the parent's ViewState directly (still disallowed, Q4):**

```html
<!-- badge.jay-html -->
<span>{parentPageTitle}</span>
<!-- parentPageTitle is not a tag on Badge's own contract — not resolvable -->
```

## Trade-offs

| Approach                                                                    | Pro                                                                                                                                                                                                          | Con                                                                                                                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Require both `props`/`tags`, validated equal at Tier 2 (chosen, Q9)         | Contract file shape identical at every tier; tier detection is pure file-presence, no content sniffing; strengthens an existing Tier 3 norm (DL#124: props must be declared) rather than inventing a new one | Field-list repetition in the contract for a trivial Tier 2 component; needs a props↔tags vocabulary translation (Q10) to actually validate        |
| Forbid `props:` at Tier 2, `tags:` only (first draft of this log)           | No repetition; nothing to keep in sync                                                                                                                                                                       | Tier 2 and Tier 3 contracts look structurally different — can't tell which tier from the file alone; reintroduces tier-dependent schema branching |
| Inline `jay-data` block instead of an external contract                     | No `props:` section exists to be confused with, by construction                                                                                                                                              | Inline data has no phase annotations (DL#51) and no established `variant` tagging (DL#38) — can't support Tier 2's actual requirements            |
| One Tier 2 path, empty props/tags degenerate naturally into DL#162's unwrap | Exactly three tiers, no fourth special case; empty contract "just works" as a trivial instance of the same rule                                                                                              | Compiler must guarantee the degenerate case produces output equivalent to DL#162's dedicated unwrap path — needs a regression test                |

## Verification Criteria

1. Tier is determined solely by file presence (contract file, `.ts` file) — no logic anywhere inspects contract contents to decide tier.
2. A Tier 2 component (contract present, `.ts` absent) compiles via the headless-instance pipeline with an auto-generated passthrough definition, using `props` as the input channel exactly as Tier 3 does.
3. A Tier 2 contract whose `props` and `tags` don't match (name or type) fails compile-time validation with a message naming the specific mismatch (Phase 3).
4. A Tier 2 contract whose `props` and `tags` do match compiles cleanly with no warnings.
5. Static and `{expr}` instance attributes resolve onto `props` exactly as DL#84 defines, including DL#152's phase validation (a `slow`-phase prop rejects a binding whose source is only available at `fast` or `fast+interactive`).
6. `type: variant` tags drive `if`-based conditionals in a Tier 2 component's own template, using the standard contract/variant mechanism (DL#38) — no special-casing versus Tier 3.
7. A Tier 2 component whose contract declares empty `props`/`tags` produces output equivalent to DL#162's shipped unwrap behavior — no regression.
8. DL#181 `ref`-anchored overrides work against a Tier 2 component's injected template with no special-casing.
9. No interactive refs are generated for a Tier 2 component — attempting one is a compile error, consistent with DL#162's Q2 answer.
10. Tier 1 (no contract) and Tier 3's existing looser props-declaration check (DL#124) are both completely unchanged by this log.
