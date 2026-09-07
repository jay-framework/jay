# Design Log #181 — Headfull Component Override

## Background

Jay composes pages by importing headfull and headless components into `jay-html` via `<jay:xxx>` tags. For headfull full-stack components, composition today is one-directional: the compiler parses the component's own `.jay-html`, extracts its body, and injects it into the `<jay:Name>` tag at the usage site at compile time (DL#111). The usage site can pass props (DL#84) and read/attach behavior through refs (DL#14), but it has no way to touch the component's own markup once injected.

Real usage keeps needing exactly that: override a button's label, override a section's text and image together, delete a paragraph a particular page doesn't want, replace the contents of a container like a menu. None of these are prop changes — the component wasn't necessarily designed to parameterize that value — and none are full replacements, since most of the component's markup should stay as authored.

### Related

- DL#14 — References API
- DL#27 — Guiding principles of Jay
- DL#37 — Composite Component
- DL#38 — Contract File
- DL#45 — View State Types
- DL#46 / DL#47 — Recursive jay-html (precedent for reusing `ref` instead of new syntax)
- DL#51 — jay-html with contract references (refs-vs-contract validation rule this log amends)
- DL#84 — Headless component props and repeater support (rejected named-slot design; inline-template ViewState scoping precedent)
- DL#111 — Nested headfull full-stack components (template injection mechanism this log builds on)
- DL#123 — Deeply nested headfull and headless components (Question 4, unanswered: does a headfull component need a slot/children mechanism?)
- DL#156 — Keyed headless component props (YAML-body precedent, doc style)

## Problem

Headfull FS components inject their whole template into the usage site with no seam for partial customization. DL#123 raised this directly as an open, unanswered question (Q4: does a layout-style headfull component need a `<slot />` mechanism?) and left it unresolved. DL#84 considered and rejected named slots — but for a different problem: headless components have no default markup at all, so "slot" there just meant "the usage site supplies the entire body," which whole-template replacement already covers.

The problem here is narrower and harder: the component **has** default markup, and the usage site needs to change **part** of it — a label, an image, a paragraph's presence, a container's children — while leaving the rest untouched, without breaking Jay's central value that a design can change freely as long as it still conforms to its contract (DL#27).

## Questions & Answers

**Q1: Should the component's contract declare which parts are overridable (an `overrides:` allow-list, parallel to `props:`)?**

A1: No. This was the first design considered and rejected. It forces the component author to anticipate and pre-declare, in code, every location a future usage site might want to touch — extra authoring work with no clear stopping point, and it re-couples design and code exactly where Jay works hardest to keep them apart: "as long as the design conforms to the same contract, we do not care about the design changing." An allow-list makes "what's overridable" a code decision instead of a design decision.

**Q2: Should overrides target arbitrary elements via CSS-style selectors (tag/class/id/structural position) instead of any pre-existing marker?**

A2: Considered, set aside for v1. Selector targeting needs no author cooperation at all and is resolvable at compile time against the same parsed tree DL#111 already builds for template injection — genuinely attractive, and not ruled out for later. But it anchors override stability to classes that were only ever meant for styling, which is a weaker contract than an explicit marker. Jay already has a sanctioned "this point is addressable" concept — `ref` (DL#14), already reused by recursion (DL#46/#47) instead of inventing new syntax. Reusing it again keeps one addressing mechanism instead of two. See Trade-offs.

**Q3: `ref` only exists where the contract requires it (DL#51: a `ref` in jay-html not required by the contract is a validation error). Doesn't targeting by `ref` just reintroduce Q1's problem — the author has to have already added one?**

A3: No, provided DL#51's rule is relaxed. A `ref` that the contract doesn't require should be _allowed_ to exist in the jay-html purely as an override anchor — it's simply excluded from the component's generated `Refs` type, since it's not for the component's own code, only for external targeting. Adding one is a pure design-file edit: no contract change, no code change, no effect on any other usage site of the same component. This puts the "what's overridable, right now, for this use" decision in the hands of whoever is editing the design file at the point of use — which is where Jay already puts design decisions.

**Q4: Will it be clear to an agent that it should add a `ref` first when asked to override a location that doesn't have one?**

A4: Via two mechanisms already established elsewhere in this codebase, not new ones. Reactively: an override targeting a missing `ref` is a compile error that names the fix (consistent with the agent-friendly validation philosophy of DL#145/#147/#166/#167 — pluggable jay-html validation was built exactly to give this kind of actionable feedback). Proactively: the Designer agent-kit guide states the two-step workflow directly, so an agent doesn't need to discover it by trial and error.

**Q5: What operations does an override support, and how does a _partial_ override work — e.g. overriding a subset of CSS properties?**

A5: Two primitives cover every case raised: content replace and remove. Both merge per-key rather than replacing wholesale — an attribute override only touches the attributes given (overriding `alt` doesn't clear `src`), and a `style` override merges per CSS property rather than replacing the whole `style` attribute. The per-property style merge relies on ordinary CSS cascade (inline style beats class rules) so the compiler never has to read or modify the component's own stylesheet — the component's CSS stays a black box, same as its ViewState and Refs types.

**Q6: What does override content resolve against — the usage site's data, or the target component's?**

A6: The target headfull component's own ViewState and Refs — the same scope its own template already compiles against, and the same rule DL#84 already established for a headless component's inline template. Override content can therefore use live bindings (`{itemCount}`), not just static markup.

**Q7: Jay already has a structural coordinate system (`jay-coordinate`, DL#103/#126) for aligning SSR output with hydration, and for addressing elements/components across the main/sandbox security boundary (DL#15/#17). Could that same coordinate scheme serve as the override anchor instead of `ref`, removing the need to add a `ref` at all?**

A7: No — considered and rejected, because the two problems have different stability requirements. Coordinates only need to stay consistent _within a single compilation_: SSR output and the hydration script that resolves it are produced from the same build, at the same moment, from the same source; the main/sandbox coordinate exchange happens within one running instance of the same compiled component. Nothing in either use case requires a coordinate to still mean the same thing after the source template has since been edited.

An override anchor has the opposite requirement: it's authored at one point in time, against one version of the target component's markup, and must keep resolving correctly after that component is later redesigned — arbitrarily, by someone who has no knowledge of who's overriding what. A coordinate (`parentCoord/childIndex`, DL#126) is a structural position; it silently points at a different element (or nothing) the moment the target's markup is reordered, wrapped, or restructured, which is a normal and expected outcome of design decoupled from code (DL#27) — the whole premise this feature exists to serve. A `ref` is a name, chosen once, that survives exactly that kind of restructuring as long as the named element itself still exists. Reusing the coordinate system here would quietly reintroduce the fragility DL#181 exists to avoid, for the sake of removing a one-line `ref` addition. `ref` stays the only supported anchor; no structural-position fallback.

## Design

### `ref` as override anchor

Any `ref` present in a headfull component's compiled template is a valid override target — whether the contract requires it (existing refs, used for interactivity) or it was added purely to make a location overridable. This replaces DL#51's blanket "extra ref in jay-html not in the contract is an error" with:

- A `ref` required by the contract: validated and typed as before, appears on the generated `Refs` type, usable by the component's own code, and usable as an override target.
- A `ref` present in the jay-html but not required by the contract: allowed. Not typed onto `Refs` (the component's own code never sees it). Usable only as an override target.

### `<override>` syntax

`<override>` elements are only meaningful nested inside a `<jay:ComponentName>` usage tag, targeting refs in that component's own template:

```html
<override ref="name">...replacement content...</override>
<override ref="name" attr="value" ... />
<override ref="name" remove />
```

- With children: replaces the referenced element's children (its content), leaving the element itself and its existing attributes as authored.
- With attributes on the `<override>` tag itself: merged onto the referenced element, one attribute at a time — existing attributes not named are untouched.
- `style` is a special case of attribute merge: merged per CSS property, not as a whole-string replacement.
- `remove`: deletes the referenced element and its subtree from the output entirely. Mutually exclusive with children/content.
- Compiled against the target component's own ViewState/Refs (Q6), so `{binding}` expressions inside an override resolve to that component's data, not the usage site's.

### Compile-time resolution

Resolved in the same template-injection pass DL#111 already performs for headfull FS imports: after the child's `.jay-html` body is parsed and injected at the `<jay:Name>` location, the compiler walks the injected tree, matches `ref`s against the usage site's `<override>` elements, and applies content-replace / attribute-merge / remove — before ViewState and type generation. No runtime cost, no runtime branching, consistent with "decide everything the compiler can decide, as early as possible" (DL#27).

A missing-ref override is a compile error, not a silent no-op:

```
Cannot resolve override: no element with ref="cta-label" found in pricing-card.jay-html.
Add ref="cta-label" to the target element in that file, then reference it here.
```

### Agent-kit documentation

Add the two-step workflow to `packages/jay-stack/stack-cli/agent-kit-template/designer/INSTRUCTIONS.md` (or a dedicated overrides topic alongside the existing refs guide): to override part of a headfull component from a usage site, the target needs a `ref`; if it doesn't have one, add it directly in the component's own jay-html first — this is a design-file edit, not a code or contract change.

## Implementation Plan

### Phase 1: Parser

1. Parse `<override>` elements nested inside `<jay:ComponentName>` usage tags in `compiler-jay-html/lib/jay-target/jay-html-parser.ts`.
2. Capture `ref`, `remove` (boolean), other attributes (including `style`, kept as a raw property map rather than a single string), and child content.
3. Attach as `overrides: OverrideDeclaration[]` on the existing `<jay:xxx>` import/instance node.

### Phase 2: Contract & refs validation

1. Relax the DL#51 "extra ref" rule: a `ref` not required by the contract is allowed, flagged internally as override-only.
2. Split ref handling so only contract-required refs are emitted onto the generated `Refs` type; override-only refs are tracked separately for target resolution but not exposed to the component's own code.

### Phase 3: Template injection / merge logic

1. In the DL#111 template-injection step, after the child body is parsed and before it's spliced into the parent, walk the tree collecting `ref` → element.
2. For each `<override>` at the usage site, resolve its `ref` against that map; apply content replace, attribute merge (per-key), style merge (per-property), or remove.
3. Missing ref → compile error with the message format above. Ambiguous state (e.g. `remove` combined with content) → compile error.

### Phase 4: Agent-friendly validation

1. Extend the pluggable jay-html validation rules (DL#145 style) with a rule that produces the actionable "add ref, then override" message.
2. Consider a companion warning for override-only refs that no `<override>` anywhere targets (dead anchor) — optional, not required for v1.

### Phase 5: Agent-kit docs

1. Update the Designer role guide with the two-step workflow and the four canonical examples (text, image attributes, remove, container content).

### Phase 6: Smoke test

1. Add an example headfull component with a labeled button, an image, a removable paragraph, and a menu container.
2. Add a usage site exercising all four override forms.
3. Verify compiled output and a missing-ref compile error message.

## Examples

**Override a button's text:**

```html
<!-- pricing-card.jay-html (unchanged) -->
<button ref="cta-label">Buy Now</button>
```

```html
<!-- usage site -->
<jay:PricingCard>
  <override ref="cta-label">Start free trial</override>
</jay:PricingCard>
```

**Override a section's text and image together (single container ref, content replace):**

```html
<!-- usage site -->
<jay:PricingCard>
  <override ref="hero-section">
    <h2>New: Team plans</h2>
    <img src="/img/team-hero.png" alt="Team plan hero" />
  </override>
</jay:PricingCard>
```

**Remove a paragraph:**

```html
<jay:PricingCard>
  <override ref="disclaimer" remove />
</jay:PricingCard>
```

**Override a container's content (menu):**

```html
<jay:SiteHeader>
  <override ref="menu-content">
    <jay:MenuItem label="Home" href="/" />
    <jay:MenuItem label="Docs" href="/docs" />
  </override>
</jay:SiteHeader>
```

**Partial attribute and style override (image swap, subset of CSS properties):**

```html
<jay:PricingCard>
  <override ref="hero-image" src="/img/new-hero.png" alt="New hero" />
  <override ref="hero-image" style="border-radius: 16px; box-shadow: none;" />
</jay:PricingCard>
```

## Trade-offs

| Approach                                                                                | Pro                                                                                                                                                                 | Con                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract-declared override points (`overrides:`)                                        | Explicit, closed set; compiler can validate exhaustively                                                                                                            | Re-couples design and code; author must anticipate every future override; extra authoring work per component                                                                                                                                                       |
| CSS-selector targeting (no marker required)                                             | Zero author cooperation; works on any existing markup; familiar mental model for agents                                                                             | Anchors stability to styling classes never meant as a contract; ambiguous-match handling needed; not pursued for v1                                                                                                                                                |
| `ref`-anchored override, relaxed extra-ref rule (chosen)                                | Reuses existing addressing concept (DL#14/#46/#47); override-only refs are pure design-file edits with no code/contract impact; explicit, discoverable failure mode | Requires a `ref` to exist — a location without one needs a one-line design-file edit first (mitigated by Q4's actionable error + agent-kit doc)                                                                                                                    |
| Structural coordinate system (existing `jay-coordinate`, DL#103/#126/#15)               | Already implemented for SSR/hydration and main/sandbox addressing; zero authoring, no `ref` needed anywhere                                                         | Only guarantees stability within a single compilation, not across a later redesign of the target component (Q7) — silently mis-resolves or breaks after the exact kind of structural change design-decoupling is meant to allow; rejected                          |
| Materialized/copied instance with drift reconciliation (Figma-style instance overrides) | WYSIWYG editing surface; overrides anything with no anchor at all                                                                                                   | Solves a staleness problem the reference-based design doesn't have, since unoverridden content is never copied — always resolved live from source; adds a 3-way-merge-shaped reconciliation problem and file duplication for no corresponding benefit; not pursued |

## Verification Criteria

1. `<override ref="x">...</override>` inside a `<jay:Name>` tag replaces the target's children in the compiled output; the target element and its own attributes are otherwise unchanged.
2. `<override ref="x" attr="v" />` merges only the named attribute(s); other attributes on the target are untouched.
3. `<override ref="x" style="...">` merges only the named CSS properties; other properties from the target's existing inline style or CSS class are unaffected.
4. `<override ref="x" remove />` removes the target element and its subtree from compiled output.
5. Override content resolves `{binding}` expressions against the target component's own ViewState, not the usage site's.
6. A `ref` present in jay-html but not required by the contract compiles without error, is absent from the generated `Refs` type, and is a valid override target.
7. An `<override>` referencing a nonexistent `ref` produces a compile error naming the missing ref and instructing to add it in the component's own jay-html.
8. A contract-required `ref` continues to be validated and typed exactly as before this change (no regression to DL#51/#14 behavior for the interactivity path).
