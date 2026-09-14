# Design Log #192 — Enum value validation for instance props

Status: **Implemented**

## Background

DL#187 Q8 flagged, and explicitly deferred to its own log, a validation gap: a `<jay:Badge>`
instance can pass an enum-typed prop a value that isn't a declared member, and it compiles clean:

```html
<jay:Badge status="success" />
<!-- ✅ valid -->
<jay:Badge status="sucess" />
<!-- ❌ typo — compiles clean today, silently renders wrong -->
<jay:Badge status="active" />
<!-- ❌ not a member of success|warning|error — same -->
```

Every `if="{status === 'success'}"` branch in the target template evaluates false, so the badge
renders with no icon and no error anywhere pointing at the cause. This is exactly the class of bug
CLAUDE.md's validation-first principle exists to catch, and DL#187 (Tier 2 pure headfull) makes
variant-driven components a common, casually-authored pattern (badges, statuses) — precisely where
hand-typed string literals grow typos.

### Related

- DL#38 — Contract File (`type: variant`, `dataType: enum(...)`)
- DL#124 — Contract props / params consistency (home of the existing instance-prop shape checks)
- DL#152 — Phase-aware contract props (the binding-source resolution machinery reused here)
- DL#187 — Pure headfull components (Q8 defers this exact check; Q10 documents enum type identity)
- DL#189 — Phase-aware prop resolution
- DL#190 — Instance prop type coercion (member-name → numeric enum at the runtime; sibling concern)

## Problem

Two shape checks exist today for `<jay:xxx>` instance attributes (DL#124, in
`stack-cli/lib/validate.ts` `checkHeadlessInstanceProps`): does the attribute name exist as a
declared prop, and is a required prop present. DL#152/#189 add a third: is the binding's source
_phase_ ≤ the prop's phase. None checks the enum _value_ assigned to an enum-typed prop against
that enum's declared members.

`checkHeadlessInstanceProps` already, per `<jay:xxx>`:

- resolves the target contract and each prop's `dataType` (a `JayType`; `isEnumType(dt)` exposes
  `dt.values: string[]`, the declared members — `jay-type.ts:54`),
- distinguishes a **static** attribute (`status="success"`) from a **binding**
  (`status="{currentStatus}"`) via `/^\{(.+)\}$/`,
- resolves a binding's **source tag** through `resolveBindingPhase` (which already walks keyed
  imports and the page contract to find the source `ContractTag`).

So the resolution scaffolding for both the static and binding cases is already present; this log
adds the value/type check on top of it.

## Scope (user decision)

- **Static enum values → full membership validation.** The literal is in hand at compile time; check
  it against the target prop's declared `dataType.values`. This is DL#187 Q8's "cheap, self-contained"
  case.
- **Bindings → `equalJayTypes(propType, sourceType)`.** Both sides are already parsed to `JayType`,
  so we compare them with the shared structural helper — after fixing `equalJayTypes` to compare
  enums by their members _in order_, ignoring the field-derived enum name (Q2). This is both the
  correct compatibility rule (DL#190's numeric wire format requires identical declaration order) and
  false-positive-free on the enum-name mismatch. It resolves DL#187 Q8's "hard" dynamic-binding case
  for any source whose type is resolvable at validation time, with no cross-contract vocabulary
  inference — just structural comparison.

## Questions & Answers

**Q1. Error or warning?**

A1: **Error.** A non-member enum value produces a silently-broken component (no branch matches, no
output), which is worse than a missing optional prop (a warning today). It's deterministically wrong
at compile time with the literal in hand — the same tier as "missing required prop" (already an
error) and "phase mismatch" (already an error). Routed via the existing `validate.ts` classifier
(the `msg.includes(...)` branch that promotes certain messages to errors).

**Q2. Compare the parsed `JayType` instances directly, and fix `equalJayTypes` for enums (user
question + decision)?**

A2: Yes to both. Both the prop `dataType` and the source tag `dataType` are parsed to `JayType`, so a
structural comparison is the natural check — and the shared `equalJayTypes` (compiler-shared
`jay-type.ts:242`) is exactly that helper. Three facts:

1. **Reference equality (`===`) doesn't apply.** The prop enum and the source-tag enum are parsed
   separately (different contracts), producing distinct `JayEnumType` instances even when identical.
2. **`equalJayTypes` today has an enum-name bug.** Its first line is `if (a.name !== b.name) return
false;`, and `parseDataType` names an enum `pascalCase(fieldName)` (`contract-parser.ts:82`) — so
   the badge prop `status` → enum `Status` while the page tag `currentStatus` → enum `CurrentStatus`.
   The canonical **valid** binding `status="{currentStatus}"` (the DL#189 smoke-test case) has
   mismatched enum _names_ by construction. Jay's enum names are purely field-derived — they carry no
   semantic identity — so two enums with the same members _are_ the same type. **Fix: in
   `equalJayTypes`, evaluate the enum branch _before_ the `a.name !== b.name` precheck**, so enum
   equality is purely the member-list comparison (already order-sensitive in the existing enum
   branch). This is a correctness fix to the shared helper, not a local workaround.
3. **Ordered member comparison is the soundness rule (already how the enum branch works).** DL#190
   serializes an enum as its numeric value by declaration order; the page resolves `currentStatus` to
   a number via its own enum order, and the badge compares `vs.status === Status.warning` via _its_
   enum order — the two numbers coincide **iff the members match in the same order**. A subset or
   unordered check would pass same-members-different-order and then silently mis-map at runtime.

With that fix, the binding check is a **direct `equalJayTypes(propType, sourceType)` call** — no
bespoke helper:

- enum ↔ enum → equal iff members match in order (name ignored);
- primitive ↔ primitive → equal by `name` (unchanged);
- cross-kind (string ↔ enum, number ↔ boolean) → not equal → error (the enum branch fails, then the
  `name` precheck fails: `'string' !== 'Status'`).

This is stronger than "check the type name": it does real enum-member compatibility and thereby
catches DL#187 Q8's dynamic case (`active|inactive` → `success|warning|error` differs in values →
error) for any source whose type resolves at validation time — with no cross-contract vocabulary
inference. What stays deferred shrinks to **unresolvable** source types (nested/plugin paths the
walker can't reach): those are skipped, no false positive, exactly as the phase check skips an
unresolvable source today (`if (!sourcePhase) continue`).

**Blast radius of the `equalJayTypes` fix:** callers are the internal recursion in `jay-type.ts`
(union `hasType`, array/record/imported/object/promise item recursion) and `jay-html-compile-refs.ts`
ref de-dup (lines 421/428). The de-dup only compares types when two refs already share a ref name +
`repeated` slot (so the same tag/enum), and its `elementType` comparison is on element/union types,
never enums. Ignoring the enum name can only make same-membered enums compare equal — it never makes
distinct types collide beyond an already-shared name/slot. Verified by running the compiler-shared and
compiler-jay-html suites (Phase 1). **Caveat:** `equalJayTypes` uses `instanceof`, so the new
validation tests construct real `JayEnumType`/`JayAtomicType` instances rather than plain-object
`dataType` mocks (the existing phase tests mock `dataType` as plain objects but never reach the type
comparison — their bound source tags carry no `dataType`).

**Q3. Does this apply to Tier 2 (structural, props ≡ tags) and Tier 3 alike?**

A3: Yes — the check is on the prop's declared `dataType`, which both tiers have. It's tier-agnostic,
exactly like the existing name/required checks. For Tier 2 the prop `dataType` mirrors the tag
(DL#187 consistency rule), so the enum members are the same either way.

**Q4. What about a static value for a `number`/`boolean` prop (e.g. `count="4.5"`, `active="yes"`)?**

A4: Out of scope here — that's the _coercion_ concern (DL#187 lines 113–127, resolved in DL#190 at
the runtime, and the compiler codegen coercion). This log is specifically enum-member membership for
statics + kind compatibility for bindings. A follow-up could add static number/boolean _format_
validation, but it's not Q8 and not requested.

**Q5. Case sensitivity of enum members?**

A5: Exact match. Enum members are declared identifiers (`success`, not `Success`); the emitted
comparisons are case-sensitive (`status === 'success'`). A case-off value (`Success`) is a real bug
and should error. (The prop _name_ match stays case-insensitive as today — that's a separate axis.)

**Q6. Multi-value / expression attributes (`class="badge badge--{status}"`, `status="{a === b}"`)?**

A6: Only validate an attribute whose **entire** value is either a bare enum member (static case) or a
single `{path}` binding (binding case) — the same shapes the existing prop checks already handle. A
value with surrounding text or an operator inside the braces is not a plain prop binding and is
skipped (no false positives). This mirrors the existing `bindingMatch = attrValue.match(/^\{(.+)\}$/)`
gate and the phase check's `extractTagPath` behavior.

## Design

Extend `checkHeadlessInstanceProps` (`stack-cli/lib/validate.ts`) with an enum/type check in the
loop that already iterates `contract.props` and reads `lowerAttrs[prop.name]`. Reuse the existing
static-vs-binding split and `resolveBindingPhase`'s tag-resolution approach.

```ts
// inside the per-prop loop, after the phase check
const dt = contractProp.dataType;

// STATIC — entire attribute is a literal (no {binding})
if (!bindingMatch) {
  if (isEnumType(dt) && !dt.values.includes(attrValue)) {
    errors.push(
      `<jay:${contractName}> prop "${contractProp.name}" = "${attrValue}" is not a ` +
        `declared value of enum(${dt.values.join(' | ')}). ` +
        `Use one of: ${dt.values.join(', ')}.`,
    );
  }
  continue;
}

// BINDING — {path}; structurally compare the SOURCE's declared dataType to the target prop's (Q2).
// equalJayTypes now compares enums by ordered members (name ignored) and primitives by name.
const sourceType = resolveBindingDataType(bindingPath, jayHtml); // sibling of resolveBindingPhase
if (sourceType && dt && !equalJayTypes(dt, sourceType)) {
  errors.push(
    `<jay:${contractName}> prop "${contractProp.name}" (${typeLabel(dt)}) is bound to ` +
      `{${bindingPath}} (${typeLabel(sourceType)}). The binding source type must match the ` +
      `prop type.`,
  );
}
```

The `equalJayTypes` fix (compiler-shared `jay-type.ts`) — move the enum branch above the name
precheck:

```ts
export function equalJayTypes(a: JayType, b: JayType) {
  // Enum names are field-derived (pascalCase of the tag/prop name) and carry no semantic identity,
  // so two enums are equal iff their members match in order — compare before the name precheck.
  if (a instanceof JayEnumType && b instanceof JayEnumType)
    return a.values.length === b.values.length && a.values.every((v, i) => v === b.values[i]);
  if (a.name !== b.name) return false;
  if (a instanceof JayAtomicType && b instanceof JayAtomicType) return a.name === b.name;
  // …remaining branches unchanged; the old in-place enum branch is removed…
}
```

`typeLabel` (colocated in `validate.ts`) is display-only:

```ts
function typeLabel(t: JayType): string {
  return isEnumType(t) ? `enum(${t.values.join(' | ')})` : t.name;
}
```

`resolveBindingDataType` is a near-clone of `resolveBindingPhase` (same keyed-import / page-contract
walk) returning `tag.dataType` — factor the shared resolution into one `resolveBindingTag` that
returns the resolved `ContractTag`, then derive phase (`tag.phase`) or dataType (`tag.dataType`) from
it, so there's one walker, not two. When the source type can't be resolved, skip (no false positive),
matching the phase check's `if (!sourcePhase) continue`.

## Implementation Plan

### Phase 1 — Validation

1. `compiler-shared/lib/jay-type.ts`: fix `equalJayTypes` to compare enums by ordered members before
   the name precheck (Q2). Run the compiler-shared + compiler-jay-html suites to confirm no
   regression (ref de-dup, union/object recursion).
2. `stack-cli/lib/validate.ts`: add the static-membership check and the binding
   `equalJayTypes(propType, sourceType)` check to `checkHeadlessInstanceProps`; factor
   `resolveBindingPhase` and the new `resolveBindingDataType` onto a shared `resolveBindingTag`
   walker. Classify both new messages as errors in `validateJayFiles` (extend the `msg.includes(...)`
   promotion).

### Phase 2 — Tests

`stack-cli/test/validate.test.ts`, new describe block "enum value validation (DL#192)":

- static valid member → no error;
- static typo / non-member → one error naming the allowed values;
- static case-off (`Success`) → error (Q5);
- binding enum→enum, same members same order, different field-derived names
  (`status="{currentStatus}"`) → **no** error (the false-positive guard, Q2);
- binding enum→enum, same members **different order** → error (numeric-mapping soundness, Q2.3);
- binding enum→enum, different members (`active|inactive` → `success|warning|error`) → error;
- binding string-source → enum-prop → error (kind mismatch);
- binding whose source type is unresolvable → skipped, no error;
- multi-value attribute (`class="badge--{status}"`) and expression binding → skipped, no error (Q6);
- Tier 2 structural and Tier 3 both covered.

### Phase 3 — Smoke test

`examples/jay-stack/smoke-test`: add a deliberately-invalid enum value behind a validation assertion
(the harness already asserts validation errors elsewhere), confirming `jay-stack validate` / the dev
build reports it. Keep the existing valid badge passing.

### Phase 4 — Docs

`agent-kit-template/designer/contracts-and-plugins.md`: state that an enum-typed instance attribute
must be one of the contract's declared members (static), and that a bound enum source must itself be
enum-typed. One or two lines beside the existing phase-binding rules.

## Verification Criteria

1. A static enum attribute whose value isn't a declared member is a compile error naming the allowed
   members; a valid member compiles clean.
2. Case-off static value (`Success` for `success`) errors.
3. A binding whose source enum has the same members in the same order as the prop enum compiles clean
   even when the two enums have different field-derived names (`status="{currentStatus}"`) — no false
   positive; same members in a different order, or different members, errors.
4. A binding whose source type mismatches the prop (string→enum, number→boolean) errors; an
   unresolvable source type is skipped (no error).
5. Multi-value / expression attributes are not treated as plain prop bindings — no false positives.
6. Tier 2 (structural) and Tier 3 (code-backed) instances are both validated.
7. Existing DL#124/#152/#189 checks and all current fixtures/suites are unaffected.

## Trade-offs

| Approach                                                                        | Pro                                                                                                                                   | Con                                                                                                                                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static membership + fix `equalJayTypes` for enums, use it for bindings (chosen) | Catches the typo bug; catches enum member/order mismatch across a binding; one shared, correct type-equality helper; no bespoke logic | Can't validate a source whose type doesn't resolve at validation time (skipped) — same limit as the phase check; touches a shared helper (blast radius verified by suites) |
| Local `instancePropTypeCompatible` helper in `validate.ts`                      | Zero blast radius on the shared helper                                                                                                | Duplicates the enum-values comparison; leaves the latent `equalJayTypes` enum-name bug unfixed for other callers                                                           |
| Strict unfixed `equalJayTypes` / `dataType.name` equality                       | Reuse the existing helper directly                                                                                                    | Its leading name precheck rejects the valid `status="{currentStatus}"` (names are field-derived) — wrong                                                                   |

## Implementation Results

Implemented as planned across all four phases; no design deviations.

### Phase 1 — Validation

- **`compiler-shared/lib/jay-type.ts`** — moved the enum branch above the `a.name !== b.name`
  precheck in `equalJayTypes`, so two enums are equal iff their members match in order (name ignored).
  Compiler-shared (120/120) and compiler-jay-html (723 pass / 4 skipped) suites both green — the
  ref de-dup and union/object recursion callers are unaffected.
- **`stack-cli/lib/validate.ts`** — factored the binding-source resolution into one `resolveBindingTag`
  walker; `resolveBindingPhase` and the new `resolveBindingDataType` both derive from it. Added a
  `typeLabel` helper (display-only) and extended the per-prop loop in `checkHeadlessInstanceProps`:
  a static (brace-free) value is checked against `dataType.values` for enum props; a `{path}` binding
  is checked with `equalJayTypes(propType, sourceType)` when the source type resolves. Both new
  messages (`is not a declared value of enum`, `binding source type must match`) are promoted to
  errors in `validateJayFiles`. Mixed/expression values (containing a `{` but not a whole binding, or
  a bound source that doesn't resolve) are skipped — no false positives.

### Phase 2 — Tests

`stack-cli/test/validate.test.ts`, new describe block "enum value / binding type validation (DL#192)":
12 unit tests (static valid / typo / case-off / non-enum; binding same-order / different-order /
different-members / string→enum / unresolvable / mixed-expression; Tier 2 structural; and the
end-to-end `validateJayFiles` classification against a real `enum-value-invalid` fixture). Full
stack-cli suite: 83 pass.

### Phase 3 — Smoke test

`examples/jay-stack/smoke-test`: added a self-contained `test/fixtures/invalid-enum` project
(`src/pages/page.jay-html` + `src/plugins/test-badge/`) with a deliberately non-member
`status="pending"`, and a `runValidateCli` helper that spawns `jay-stack-cli validate --json` in the
fixture cwd. The test asserts exit code 1, `valid: false`, and the exact enum error message —
proving the check through the actual CLI binary. The real smoke-test project keeps valid enum values,
so its build/production tests are unaffected.

### Phase 4 — Docs

`agent-kit-template/designer/contracts-and-plugins.md`: added an "Enum prop values must match the
contract" note beside the existing phase-binding rules (literal → declared member, case-sensitive;
bound → same-membered enum source).

### Verification

All seven verification criteria met and covered by the tests above.

### Related fix — conditional class whitespace (surfaced during verification)

Building the compiler during DL#192 verification surfaced a pre-existing DL#190 break
in dev-server test `8n` (Tier 2 typed instance props): SSR class attributes rendered
with stray/double/trailing spaces (`class="badge badge--success  "`) while the
prettier-cleaned fixture expected `class="badge badge--success"` — a mismatch that
could never converge, because prettier collapses in-attribute whitespace on `yarn format`.

Root cause: the `classExpression` / `reactClassExpression` grammar rules emitted a
template literal (`` `badge ${cond?'x':''} ${cond?'y':''}` ``) where a false conditional
class left an empty segment and its separating space behind.

Fix (compiler, no separate design log per user decision): both rules now emit an array
form — `da(vs => [expr, expr, ...].filter(Boolean).join(' '))` (and
`{[...].filter(Boolean).join(' ')}` for React) — so false conditional classes contribute
nothing. The single-class React fast path (`{cond?'x':''}`) is unchanged (no whitespace
risk). Affected fixtures (compiler-jay-html, compiler todo project) were regenerated;
dev-server `8n` and all downstream suites pass.
