# Style Binding Support in Jay-HTML

## Current State

The runtime fully supports dynamic binding into style properties, as evidenced by the test in `/packages/runtime/runtime/test/lib/element.test.ts`:

```typescript
e('div', {
  textContent: dp((vs) => vs.text),
  style: {
    color: dp((vs) => vs.color),
    width: dp((vs) => vs.width),
  },
});
```

This runtime structure allows individual CSS properties to be bound dynamically using `dp()` (dynamic property), enabling reactive style updates.

## The Problem

The jay-html compiler does not support dynamic style bindings. The current implementation in `jay-html-compiler.ts` (lines 128-133) treats all style attributes as static CSS text:

```typescript
if (attrCanonical === 'style')
  renderedAttributes.push(
    new RenderFragment(`style: {cssText: '${attributes[attrName].replace(/'/g, "\\'")}'}`),
  );
```

This means jay-html cannot express reactive styles like:

```html
<div style="color: {color}; width: {width}px"></div>
```

## Why This Matters

1. **Design Tool Integration**: Design tools may want to bind dynamic values to style properties (colors, sizes, visibility, etc.)
2. **Consistency**: Other attributes support binding (class, value, disabled, etc.), but styles do not
3. **Component Flexibility**: Components need reactive styling based on view state without resorting to class-based workarounds

## High-Level Design

### Jay-HTML Syntax

Support inline binding expressions within style attribute values:

```html
<div style="color: {color}; width: {width}; background: {bg}"></div>
```

Mixed static and dynamic:

```html
<div style="margin: 10px; color: {textColor}; padding: {spacing}px"></div>
```

### Compilation Strategy

1. **Parse style attribute**: Split CSS text into individual property declarations
2. **Detect bindings**: For each property, check if the value contains `{...}` expressions
3. **Generate runtime code**:
   - Static properties: Use plain string values
   - Dynamic properties: Wrap in `dp()` with appropriate expression
   - Generate `style: { prop: value, ... }` object instead of `style: {cssText: '...'}`

### Example Transformation

**Input jay-html:**

```html
<div style="color: {color}; width: 100px; opacity: {isVisible?1:0}"></div>
```

**Generated code:**

```typescript
e('div', {
  style: {
    color: dp((vs) => vs.color),
    width: '100px',
    opacity: dp((vs) => (vs.isVisible ? 1 : 0)),
  },
});
```

### Edge Cases to Handle

1. **All static styles**: Keep current `cssText` optimization for fully static styles
2. **CSS property name normalization**: Convert kebab-case to camelCase (e.g., `background-color` → `backgroundColor`)
3. **Units**: Handle cases where units are part of the binding (e.g., `{width}px`)
4. **Escaping**: Handle quotes and special characters in static portions
5. **Empty/invalid styles**: Gracefully handle malformed CSS

## Implementation Notes

- Reuse existing expression parsing infrastructure (`parsePropertyExpression`)
- CSS parsing can be simple splitting on `;` then `:` (no need for full CSS parser)
- Consider performance: fully static styles should use `cssText` for efficiency
- Tests needed in `compiler-jay-html` package to validate both static and dynamic style compilation

## Implementation Status

**Completed** ✅

### Implementation Details

The implementation adds a new PEG.js parser rule `styleDeclarations` that properly parses CSS declarations, handling:

- Simple accessors: `{color}`, `{width}`
- Template strings: `{fontSize}px` generates `` `${vs.fontSize}px` ``
- Complex expressions through the template parser
- Kebab-case to camelCase conversion for CSS properties

### Code Changes

**PEG.js Parser** (`/lib/expressions/expression-parser.pegjs`):

1. Added `styleDeclarations` rule - Top-level entry point for parsing style strings
2. Added `styleDeclaration` rule - Parses individual `property: value` pairs
3. Added `stylePropName` rule - Matches CSS property names (including kebab-case)
4. Added `styleValueContent` rule - Parses values with template string support
5. Added `styleValueString` rule - Matches static CSS value text

**Expression Compiler** (`/lib/expressions/expression-compiler.ts`):

1. Added `StyleDeclaration` interface - Represents a parsed CSS declaration
2. Added `StyleDeclarations` interface - Contains all declarations and dynamic flag
3. Added `parseStyleDeclarations()` function - Entry point for parsing style strings

**Jay-HTML Compiler** (`/lib/jay-target/jay-html-compiler.ts`):

1. Added `renderStyleAttribute()` - Uses pegjs parser to process style strings
2. Updated `renderAttributes()` - Delegates style attribute handling to the new function

### Optimization

The implementation preserves the `cssText` optimization for fully static styles, only generating style objects when at least one property is dynamic.

### Test Coverage

**Integration Test**: `/test/fixtures/basics/style-bindings/style-bindings.jay-html`

Validates end-to-end compilation of:

- Fully dynamic styles
- Mixed static and dynamic properties
- Kebab-case property conversion
- Template string values (e.g., `{fontSize}px`)
- Static style optimization

**Unit Tests**: `/test/expressions/expression-compiler.unit.test.ts`

Added comprehensive `parseStyleDeclarations` test suite covering:

- Fully static styles
- Fully dynamic styles
- Mixed static and dynamic styles
- Template string values
- Kebab-case to camelCase conversion
- Trailing semicolons (single and multiple)
- CSS comments (`/* ... */`)
- Complex CSS functions (e.g., `linear-gradient`, `rgba`)
- Whitespace variations
- Empty declarations

These tests ensure the PEG.js parser correctly handles real-world CSS including:

- Complex gradient functions with nested parentheses
- RGB/RGBA color values with commas
- CSS comments within declarations
- Multiple consecutive semicolons
- Properties with hyphens (converted to camelCase)

### Example Output

```typescript
// Fully dynamic
e('div', { style: { color: dp((vs) => vs.color), width: dp((vs) => vs.width) } });

// Mixed static/dynamic
e('div', { style: { margin: '10px', color: dp((vs) => vs.color), padding: '20px' } });

// Kebab-case conversion + template string
e('div', {
  style: { backgroundColor: dp((vs) => vs.color), fontSize: dp((vs) => `${vs.fontSize}px`) },
});

// Fully static (optimized)
e('div', { style: { cssText: 'background: red; padding: 10px' } });
```

## Robustness

The PEG.js parser handles complex real-world CSS including:

- ✅ CSS comments (`/* ... */`) - stripped during parsing
- ✅ Complex functions with nested parentheses (e.g., `linear-gradient(rgba(...), rgba(...))`)
- ✅ Color values with commas (e.g., `rgb(223, 229, 235)`)
- ✅ URLs with quoted strings and special characters (e.g., `url('/images/I2:2069;2:1758_FILL.png')`)
- ✅ Single and double quoted strings in values
- ✅ Multiple consecutive semicolons
- ✅ Empty declarations
- ✅ Whitespace variations
- ✅ Mixed kebab-case and camelCase properties

Tested with production Figma-exported styles containing:

- 20+ properties
- CSS comments
- Complex gradient functions
- URLs with colons and special characters
- Quoted strings with various characters

## Future Considerations

- CSS-in-JS style objects: `style="{styleObject}"` to pass entire style object
- CSS custom properties: `style="--theme-color: {color}"` for CSS variables
- Animation/transition support: May need special handling for timing values
- Ternary operators in style values: Current expression parser doesn't support ternary in property expressions (only in class expressions)
