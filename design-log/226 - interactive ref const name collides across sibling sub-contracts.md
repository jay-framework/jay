# 226 - Interactive ref const name collides across sibling sub-contracts

**Status: [Implemented]** — fixed in the compiler (see Implementation Results at the bottom). This
DL originally documented and reproduced the bug with a red fixture + tests; the fix landed in the
same area and turned them green. The sections below the TL;DR are the original bug report, kept
as-authored for context.

## Decisions for the Implementer (TL;DR)

- **Symptom:** a page that binds, in one render scope, several **non-repeated** sibling
  sub-contracts that each expose a **leaf interactive tag with the same name** (e.g. `input`)
  generates the same ref const (`refInput`) multiple times:
  ```ts
  const [firstNameRefManager, [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
  const [emailRefManager,     [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
  const [messageRefManager,   [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
  ```
  esbuild then fails with `The symbol "refInput" has already been declared` and the page never
  hydrates.
- **Deep root cause (one line):** the ref const name is derived from the **leaf tag name only**,
  discarding the sub-contract path that would make it unique
  — `packages/compiler/compiler-jay-html/lib/contract/contract-to-view-state-and-refs.ts:240-241`.
- **Why the two existing de-dup mechanisms don't save it:**
  - `RefNameGenerator.newConstantName` (`jay-html-compile-refs.ts:242-253`) is the parse-time
    disambiguator. It treats _same leaf name + same render scope_ as the **same ref** and returns
    the name unchanged (lines 246-247). Non-repeated siblings share **one** render scope, so the
    2nd and 3rd `input` refs get `refInput` with no suffix.
  - `getUniqueRefConstName` (`jay-html-compile-refs.ts:654-677`) is the emit-time backstop. It
    only renames **autoRef** refs; these three refs are all used in the template (non-autoRef), so
    it returns each `constName` unchanged (lines 657-660).
  - `getUniqueRefManagerName` (`jay-html-compile-refs.ts:635-652`) _does_ make the **manager**
    names unique (`firstNameRefManager` / `emailRefManager` / `messageRefManager`), which is why
    the collision is only on the `refInput` consts, not the managers.
- **A fix must:** produce a **unique const per ref path** (e.g. `refFirstNameInput`,
  `refEmailInput`, `refMessageInput`), leave all existing fixtures byte-for-byte unchanged, and
  keep the ref's public name (the `'input'` string handed to `ReferencesManager.for`) as-is — only
  the local `const` variable needs disambiguating.
- **Repro:** fixture `packages/compiler/compiler-jay-html/test/fixtures/contracts/duplicate-ref-sibling-inputs/`
  + the two red tests named `generates a unique ref const per non-repeated sibling sub-contract (DL#226)`
  in `generate-element.test.ts` and `generate-element-hydrate.test.ts`. Both are **expected to fail**
  against today's compiler.

## Background

A `.jay-contract` compiles to a `ViewState` type and a `RefsTree`. Each interactive tag becomes a
`Ref`. When a jay-html binds such a ref via `ref="..."`, the compiler emits a `ReferencesManager`
tree whose shape mirrors the `RefsTree`; each node emits one destructured `const` declaration:

```ts
// jay-html-compile-refs.ts:730-731
const renderedRefManager = `    const [${name}, [${refVariables}]] =
    ${referenceManagerInit}(${options}[${elemRefsDeclarations}], ...);`;
```

`refVariables` are the per-ref local `const` names; `name` is the manager name. Both must be
unique within the generated function, or the emitted module does not compile.

The ref const name originates in the contract traversal:

```ts
// contract-to-view-state-and-refs.ts:238-250  ✅ verified (read)
if (tag.type.includes(ContractTagType.interactive)) {
    const elementType = tag.elementType?.join(' | ') || 'HTMLElement';
    let refName = camelCase(tag.tag);              // leaf tag only
    let constName = camelCase(`ref ${refName}`);   // → 'refInput'
    const ref = mkRef(refName, tag.tag, constName, isRepeated, false, viewStateType, ...);
    ...
}
```

The traversal already knows the parent sub-contract path — `childRefs[subTag.tag]` is populated at
`contract-to-view-state-and-refs.ts:90` as it recurses — but the per-ref `constName` is computed
from `tag.tag` (the leaf) alone and never incorporates that path.

## Problem

When a single page binds several non-repeated sibling sub-contracts whose leaf interactive tags
share a name, every one of those refs carries `constName = 'refInput'`. They land in **separate
RefsTree child nodes** (one per sub-contract), so the emitter produces one `const [..., [refInput]]`
per node — all in the **same** render function scope. The generated module then has three (or more)
`const refInput` declarations side by side, which is a duplicate-declaration error. esbuild (the
client bundler) reports:

```
✘ [ERROR] The symbol "refInput" has already been declared
```

and the page's client script never loads, so the component does not hydrate. The failure is
**silent at compile time** (type generation and validation both pass — see the fixture's
`validations: []`); it only surfaces at bundle time.

### Real-world trigger (generic)

Surfaced when a forms plugin generated one contract per form, with a per-field sub-contract each
exposing an `input` interactive tag, all bound on one page. Three fields named, say, `firstName`,
`email`, `message`, each a `fast+interactive` sub-contract containing `{ tag: input, type:
interactive }`, bound on one page through a headless region keyed `form`, is enough to collide.

## Prior Art / Adjacent Mechanisms

Three de-duplication mechanisms exist in the ref pipeline. Each is verified against source; none
disambiguates this case.

| Mechanism | File:line | What it de-dups | Why it misses this case |
| --- | --- | --- | --- |
| `RefNameGenerator.newConstantName` | `jay-html-compile-refs.ts:242-253` | parse-time const names, by `(name, variables-scope)` | lines 246-247 reuse the name when the scope matches; non-repeated siblings share one scope, so the leaf `input` is judged "the same ref" and returned without a suffix |
| `getUniqueRefConstName` | `jay-html-compile-refs.ts:654-677` | emit-time const names, **autoRef only** | lines 657-660 return non-autoRef const names unchanged; all three refs here are used in the template (non-autoRef) |
| `getUniqueRefManagerName` | `jay-html-compile-refs.ts:635-652` | **manager** names | works — the managers are unique (`firstNameRefManager`/…); it does not touch the ref consts |

The leaf-name path is reached because a **headless-import** ref binding (`ref="form.firstName.input"`)
resolves through `importedRefNameToRef` and calls `newConstantName(importedRef.ref, variables)` with
`importedRef.ref` = the leaf `input` (`jay-html-compiler.ts:325-330`). A page's **own** contract
bound by full path (`ref="firstName.input"`) instead falls to the `camelCase(originalName)` branch
(`jay-html-compiler.ts:363-365`) → `firstNameInput`, which is already unique — so the page-own-contract
path does not collide. The collision needs the headless-import (leaf-name) path.

### Existing duplicate-ref fixtures and why they do **not** cover this

- **`collections/duplicate-ref-only-one-used`** — imports the same headless contract and two refs
  share the leaf `isSelected`, but **only one is bound** in the template. The bound one is
  non-autoRef (kept as `refIsSelected`); the unbound one is **autoRef**, so `getUniqueRefConstName`
  renames it to `refIsSelected2`. The autoRef branch fires → no collision.
- **`contracts/duplicate-ref-names`** — two `button` refs, but both sub-contracts are
  **`repeated: true`**. Repeated siblings compile into **distinct `forEach` scopes** → distinct
  `variables` → `newConstantName` appends a suffix (`refButton` / `refButton2`). No collision.
- **`collections/duplicate-ref-different-branches`** — two `deleteButton` refs in a `forEach`
  branch and a conditional branch, again **distinct scopes** → `refDeleteButton` /
  `refDeleteButton2`. No collision.

The uncovered gap, closed by the new fixture: **non-repeated** sibling sub-contracts, **same leaf
interactive tag name**, **all bound** on one page → one shared scope, all non-autoRef → neither the
scope-based nor the autoRef-based disambiguator fires.

## Questions and Answers

**Q: Is the bug the leaf-only const name, or the de-dup logic?**
A: Both, layered. The deep cause is leaf-only naming (`contract-to-view-state-and-refs.ts:240-241`):
if the const embedded the sub-contract path, it would already be unique and no de-dup would be
needed. Given leaf-only naming, the proximate reason the collision reaches output is that
`newConstantName`'s same-scope reuse (246-247) silently returns the duplicate, and
`getUniqueRefConstName` only guards autoRef. A fix at the naming layer is the cleanest; a fix at
either de-dup layer would also work but must keep the manager/ref-name/public-API invariants.

**Q: Does `newConstantName` same-scope reuse have a legitimate purpose?**
A: Yes — a single ref used by multiple elements in the same scope should map to one const. The bug
is that it cannot tell "same ref reused" from "two distinct refs that happen to share a leaf name",
because the only key it has is the leaf name + scope.

**Q: Repeated vs non-repeated — why does `repeated` dodge the bug?**
A: Each repeated sub-contract renders inside its own `forEach`, which creates a new `variables`
scope. `newConstantName` keys on scope, so the siblings land on different names. Non-repeated
siblings have no such scope boundary; they share the page/region scope.

**Q: Does the ref's public name change under a fix?**
A: It must not. `ReferencesManager.for(options, ['input'], ...)` takes the ref's **public** name
(`'input'`), which is correct per sub-contract and must stay. Only the destructured local `const`
needs to be unique.

## Root Cause (with file:line)

1. **Leaf-only const name (deep cause).**
   `packages/compiler/compiler-jay-html/lib/contract/contract-to-view-state-and-refs.ts:240-241`
   — `refName = camelCase(tag.tag)`, `constName = camelCase('ref ' + refName)`. The sub-contract
   path (available at `:90` as `childRefs[subTag.tag]`) is discarded, so every leaf `input` across
   sibling sub-contracts gets `constName = 'refInput'`.
2. **Parse-time disambiguator does not fire (proximate cause).**
   `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compile-refs.ts:242-253`
   (`RefNameGenerator.newConstantName`) returns the existing name when the scope matches
   (lines 246-247). Non-repeated siblings share one scope → no suffix. Reached for headless-import
   bindings via `jay-html-compiler.ts:325-330` (`newConstantName(importedRef.ref, …)`,
   `importedRef.ref` = leaf).
3. **Emit-time disambiguator does not fire (backstop).**
   `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compile-refs.ts:654-677`
   (`getUniqueRefConstName`) renames only autoRef refs (lines 657-660). All three refs are
   non-autoRef.
4. **Emission.**
   `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compile-refs.ts:730-731` emits one
   `const [${name}, [${refVariables}]] = ReferencesManager.for(...)` per RefsTree node; the three
   nodes each emit `[refInput]`, colliding in one function scope.

## Minimal Repro

Fixture `packages/compiler/compiler-jay-html/test/fixtures/contracts/duplicate-ref-sibling-inputs/`:

**Headless contract** (`../form-fields-headless/form-fields-headless.jay-contract`):

```yaml
name: form-fields
tags:
  - tag: firstName
    type: sub-contract
    phase: fast+interactive
    tags:
      - tag: input
        type: interactive
        elementType: HTMLInputElement
  - tag: email
    type: sub-contract
    phase: fast+interactive
    tags:
      - tag: input
        type: interactive
        elementType: HTMLInputElement
  - tag: message
    type: sub-contract
    phase: fast+interactive
    tags:
      - tag: input
        type: interactive
        elementType: HTMLTextAreaElement
```

**Page** (`duplicate-ref-sibling-inputs.jay-html`):

```html
<script type="application/jay-headless" plugin="test-form-fields" contract="form-fields" key="form"></script>
...
<input ref="form.firstName.input" />
<input ref="form.email.input" />
<textarea ref="form.message.input"></textarea>
```

The test plugin is registered in `test/test-utils/test-resolver.ts` as
`test-form-fields:form-fields` (test infrastructure only; not compiler code).

## Expected vs Actual generated output

The relevant lines of the generated `hydrate` (the `render` target is identical in shape).

**Actual (today's compiler — the bug):**

```ts
const [firstNameRefManager, [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
const [emailRefManager,     [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
const [messageRefManager,   [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
const [formRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
    firstName: firstNameRefManager,
    email: emailRefManager,
    message: messageRefManager,
});
const [refManager, []] = ReferencesManager.for(options, [], [], [], [], { form: formRefManager });
// ... usage:
adoptElement('S0/0/1', {}, [], refInput()),   // firstName
adoptElement('S0/0/2', {}, [], refInput()),   // email
adoptElement('S0/0/3', {}, [], refInput()),   // message
```

Fed to esbuild, this produces (captured in this branch):

```
✘ [ERROR] The symbol "refInput" has already been declared
    const [emailRefManager, [refInput]] = ReferencesManager.for(...)
          ^
  The symbol "refInput" was originally declared here:
    const [firstNameRefManager, [refInput]] = ReferencesManager.for(...)
```

**Expected (a correct compiler — one unique const per ref path):**

```ts
const [firstNameRefManager, [refFirstNameInput]] = ReferencesManager.for(options, ['input'], [], [], []);
const [emailRefManager,     [refEmailInput]]     = ReferencesManager.for(options, ['input'], [], [], []);
const [messageRefManager,   [refMessageInput]]   = ReferencesManager.for(options, ['input'], [], [], []);
// ... usage:
adoptElement('S0/0/1', {}, [], refFirstNameInput()),
adoptElement('S0/0/2', {}, [], refEmailInput()),
adoptElement('S0/0/3', {}, [], refMessageInput()),
```

The ref public names (the `'input'` strings) are unchanged; only the local consts are
disambiguated by their sub-contract path. The two fixture expected-output files
(`generated-element.ts`, `generated-element-hydrate.ts`) are written to **this correct form** — so
the repro tests are red today and will turn green only when the compiler emits unique consts (no
false green).

## Verification Criteria (what a fix must satisfy)

1. For the repro fixture, the generated `render` and `hydrate` declare a **distinct** const per ref
   path — e.g. `refFirstNameInput`, `refEmailInput`, `refMessageInput` — and the `DL#226` tests in
   `generate-element.test.ts` and `generate-element-hydrate.test.ts` pass.
2. The generated module compiles under esbuild with **no** "already been declared" error.
3. The ref's **public name** (the string passed to `ReferencesManager.for`) and the manager names
   are unchanged; the page-side ref API (`refs.form.firstName.input`, …) is unaffected.
4. **No existing fixture changes** — in particular `duplicate-ref-only-one-used`,
   `duplicate-ref-names`, and `duplicate-ref-different-branches` keep their current expected output
   byte-for-byte (the full `generate-element*` and `jay-html-contract-ref` suites stay green).
5. Prevention per `jay/CLAUDE.md`: consider whether this should additionally be a build-time
   validation (a contract/jay-html check that flags a ref-const collision with a clear message)
   rather than relying only on the esbuild failure.

## Implementation Results

**Status: [Implemented]** (fixed, not just documented — this appendix supersedes the "no fix in
this branch" note at the top).

### Root cause confirmed

Reproduced exactly as described. With the repro fixture, today's compiler emitted three
`const [..., [refInput]]` declarations in one scope. The bug is the **proximate cause** (#2 in Root
Cause): `RefNameGenerator.newConstantName` keyed its same-scope *reuse* check only on the render
scope (`variables`), so two **distinct** imported refs that share a leaf tag name (`input`) in one
scope were mistaken for *the same ref used twice* and collapsed to one const.

### The fix (naming-layer, minimal)

Rather than embed the sub-contract path into every const name (the deep-cause fix sketched above —
rejected because it would rewrite the const name of **every** imported ref and break
`duplicate-ref-only-one-used` etc., violating criterion #4), the fix teaches `newConstantName` the
difference between "same ref reused" and "distinct refs sharing a leaf name":

- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compile-refs.ts` —
  `newConstantName(refName, variables, identity = refName)` now reuses a const name only when
  **both** the render scope *and* the ref **identity** match. `identity` is the ref's stable key;
  it defaults to `refName`, so page-own refs (whose `refName` is already the full, unique ref path)
  are unchanged.
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts` — the two
  **imported-ref** call sites (`renderElementRef`, `renderChildCompRef`) now pass the full template
  path (`element.attributes.ref`, e.g. `form.firstName.input`) as the identity. Distinct sibling
  refs therefore no longer collapse; they fall through to the existing numeric-suffix disambiguator.

### Deviation from the design: numeric suffixes, not path-prefixed names

The design proposed `refFirstNameInput` / `refEmailInput` / `refMessageInput`. The implementation
instead emits `refInput` / `refInput2` / `refInput3`. Reason: the framework **already**
disambiguates every other ref-name collision with a numeric suffix (`refIsSelected2`,
`refDeleteButton2`, `refRemoveButton2` — all for cross-scope collisions of imported refs). A
path-prefixed scheme applied only to same-scope collisions would sit inconsistently next to those,
and applying it everywhere would change existing fixtures (criterion #4). Numeric suffixing is the
minimal, consistent fix. The two fixture expected-output files were updated accordingly. Criteria
#2 (no duplicate symbol), #3 (public names / manager names / page-side API unchanged) are met as
written.

### Prevention (criterion #5)

No separate build-time validation is added. The fix makes the collision **structurally
impossible** at the naming layer — the compiler can no longer emit two identical ref consts in one
scope — so there is nothing left for a validation rule to catch. Prevention-over-features favors
the validation only when the framework cannot itself guarantee correctness; here it can.

### Tests

- The two repro tests `generates a unique ref const per non-repeated sibling sub-contract (DL#226)`
  in `generate-element.test.ts` and `generate-element-hydrate.test.ts` are now **green**.
- Added the missing `form-fields-headless.jay-contract.d.ts` fixture (generated by `compileContract`
  — the original repro branch omitted it; vitest transpiles with esbuild so its tests passed, but
  `yarn build:check-types` failed with `Cannot find module …form-fields-headless.jay-contract`).
  A `generate-contract-dts.test.ts` case now keeps that `.d.ts` in sync with the compiler.
- Full suites green with no fixture changes beyond the two DL#226 expected-output files (and the
  new `form-fields-headless` contract + `.d.ts`): `@jay-framework/compiler-jay-html` 757 passed /
  4 skipped; `@jay-framework/compiler` 252 passed; `@jay-framework/compiler-jay-stack` 70 passed;
  `build:check-types` clean.
