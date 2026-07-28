# DL#162 — Structural Headfull Components (No Code File)

## Background

Headfull full-stack components currently require three files: `.jay-html`, `.jay-contract`, and `.ts`. The `.ts` file provides the component definition via `makeJayStackComponent`, including render phase implementations.

Many headfull components are purely **structural** — shared headers, footers, layout wrappers. They have props but no data logic, no services, no render phases. Their `.ts` file is boilerplate:

```typescript
export const header = makeJayStackComponent<HeaderContract>()
  .withProps<HeaderProps>()
  .withFastRender(async (props) => phaseOutput({ logoUrl: props.logoUrl }, {}));
```

This creates a role boundary problem: the designer creates the template and contract, but needs the developer to write trivial passthrough code before the component works.

## Problem

1. Structural headfull components require boilerplate `.ts` files
2. The designer role cannot create a complete headfull component independently
3. Agents frequently get the `.ts` wrong (missing `.withProps()`, wrong types)
4. The contract already declares everything needed — props and their types

## Design

### Allow headfull imports without `src`

When a headfull import has `contract` but no `src`, treat it as a structural component. The framework generates a passthrough component automatically:

```html
<!-- No src attribute — structural component -->
<script
  type="application/jay-headfull"
  src="../components/site-header/site-header"
  names="SiteHeader"
  contract="../components/site-header/site-header.jay-contract"
></script>
```

Wait — the `src` currently points at the `.ts` file AND identifies the component's jay-html directory. We need `src` for the jay-html location. The question is whether `src` must resolve to a `.ts` file.

### Approach: auto-generate component when `.ts` is missing

Keep `src` required (it locates the component directory and jay-html). But when the `.ts` file doesn't exist at that path:

1. **Parser** — skip `analyzeExportedTypes()`, derive types from contract only
2. **Compiler** — generate an inline passthrough component instead of importing from the module
3. **Dev server** — create a synthetic component definition that passes props → ViewState
4. **Production build** — same synthetic component

The synthetic component behaves as:

```typescript
makeJayStackComponent<Contract>()
  .withProps<Props>()
  .withFastRender(async (props) => phaseOutput(props, {}));
```

All contract props become ViewState fields at fast phase. No slow phase, no interactive phase, no services.

### What the designer creates (two files only)

```
src/components/site-header/
  site-header.jay-html       # template
  site-header.jay-contract   # props declaration
```

No `.ts` file needed. The `src` attribute in the import still points to `../components/site-header/site-header` — the framework looks for `.ts` there, and when it's absent, generates the passthrough automatically.

## Implementation Plan

### Phase 1: Parser

**`compiler-jay-html/lib/jay-target/jay-html-parser.ts`** — in `parseHeadfullFSImports()`:

- When resolving `src`, check if the `.ts` file exists
- If missing, skip `analyzeExportedTypes()`
- Create a synthetic `codeLink` with a generated component name
- Derive ViewState type from contract props (all props → fast phase data tags)

### Phase 2: Dev server loading

**`stack-server-runtime/lib/load-page-parts.ts`**:

- When loading headfull component module, check if file exists
- If missing, create a synthetic `compDefinition` with fast render that passes props through

### Phase 3: Production build

**`production-server/lib/builder/load-production-parts.ts`**:

- Same synthetic component fallback

### Phase 4: Compiler code generation

**`compiler-jay-html/lib/jay-target/jay-html-compiler.ts`**:

- When no code module exists, generate inline component definition instead of import statement
- The generated code creates a passthrough component in-place

### Phase 5: Validation

**`stack-cli/lib/validate.ts`**:

- Don't error when headfull component has no `.ts` file (if contract exists)
- Validate that structural components don't declare render phases they can't have

## Questions

1. Should the developer be able to add a `.ts` later to upgrade a structural component to a full component? (Yes — if `.ts` exists, use it; if not, use passthrough)
2. Should we support interactive refs in structural components? (No — refs require component code to handle events. Structural components are render-only.)

## Trade-offs

| Choice                        | Pro                                    | Con                                |
| ----------------------------- | -------------------------------------- | ---------------------------------- |
| Auto-generate from contract   | Designer-independent, zero boilerplate | Less explicit, "magic" behavior    |
| Keep requiring `.ts`          | Explicit, no special cases             | Role boundary problem, boilerplate |
| Generate `.ts` on `agent-kit` | File exists for inspection             | Generated code to maintain         |

## Implementation Results

### Key insight: structural = template fragment, not component

The original design proposed a synthetic passthrough component (props → ViewState). This was wrong. A structural component has **no props, no tags, no ViewState**. It's a reusable template fragment — the `<jay:>` tag is unwrapped and its content becomes plain HTML in the parent.

Data inside a structural component comes from **headless imports declared in its own `<head>`**, not from the parent via props.

### What changed (simplified from original plan)

1. **Parser** (`jay-html-parser.ts`):

   - Check if `.ts` file exists after resolving `src`
   - If missing: inject the component's jay-html template into the parent body, then **unwrap** the `<jay:>` tag (replace with its innerHTML)
   - `continue` — no `headlessImport` entry is created, no contract types are built

2. **Compiler** (`jay-html-compiler.ts`):

   - Structural components are excluded from `headlessContractNames` — the compiler never sees them as component tags (they were unwrapped to plain HTML by the parser)
   - The inline passthrough code from the original plan was removed — not needed

3. **Runtime** (`load-page-parts.ts`, `load-production-parts.ts`):
   - `structural` flag on `JayHeadlessImports` is kept defensively but never set (structural components `continue` before pushing)
   - No synthetic component code — not needed

### What was removed from original plan

- Synthetic passthrough component (`phaseOutput(props, {})`)
- Props → ViewState mapping
- Inline component generation in compiler
- `structural` entries in page-parts.json

### Contract for structural components

Minimal — just a name:

```yaml
name: InfoBox
```

No props, no tags. The contract exists only to name the component for the import.

### Smoke test

`examples/jay-stack/smoke-test/src/components/info-box/` — two files only (`.jay-html` + `.jay-contract`), used via `<jay:infoBox>` in the headfull page. Verified in both dev and production modes.
