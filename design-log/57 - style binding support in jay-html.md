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
})
```

This runtime structure allows individual CSS properties to be bound dynamically using `dp()` (dynamic property), enabling reactive style updates.

## The Problem

The jay-html compiler does not support dynamic style bindings. The current implementation in `jay-html-compiler.ts` (lines 128-133) treats all style attributes as static CSS text:

```typescript
if (attrCanonical === 'style')
    renderedAttributes.push(
        new RenderFragment(
            `style: {cssText: '${attributes[attrName].replace(/'/g, "\\'")}'}`,
        ),
    );
```

This means jay-html cannot express reactive styles like:

```html
<div style="color: {color}; width: {width}px">
```

## Why This Matters

1. **Design Tool Integration**: Design tools may want to bind dynamic values to style properties (colors, sizes, visibility, etc.)
2. **Consistency**: Other attributes support binding (class, value, disabled, etc.), but styles do not
3. **Component Flexibility**: Components need reactive styling based on view state without resorting to class-based workarounds

## High-Level Design

### Jay-HTML Syntax

Support inline binding expressions within style attribute values:

```html
<div style="color: {color}; width: {width}; background: {bg}">
```

Mixed static and dynamic:

```html
<div style="margin: 10px; color: {textColor}; padding: {spacing}px">
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
<div style="color: {color}; width: 100px; opacity: {isVisible?1:0}">
```

**Generated code:**
```typescript
e('div', {
    style: {
        color: dp((vs) => vs.color),
        width: '100px',
        opacity: dp((vs) => vs.isVisible ? 1 : 0),
    },
})
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

The implementation uses the existing expression parser infrastructure (`parsePropertyExpression`) instead of regex parsing. This ensures proper handling of:

- Simple accessors: `{color}`, `{width}`
- Template strings: `{fontSize}px` generates `` `${vs.fontSize}px` ``
- Complex expressions through the template parser

### Code Changes

**Location**: `/packages/compiler/compiler-jay-html/lib/jay-target/jay-html-compiler.ts`

1. Added `cssPropertyToCamelCase()` - Converts kebab-case CSS properties to camelCase for JS style objects
2. Added `renderStyleAttribute()` - Parses style declarations and generates appropriate runtime code
3. Updated `renderAttributes()` - Delegates style attribute handling to the new function

### Optimization

The implementation preserves the `cssText` optimization for fully static styles, only generating style objects when at least one property is dynamic.

### Test Coverage

**Test**: `/test/fixtures/basics/style-bindings/style-bindings.jay-html`

Validates:
- Fully dynamic styles
- Mixed static and dynamic properties
- Kebab-case property conversion
- Template string values (e.g., `{fontSize}px`)
- Static style optimization

### Example Output

```typescript
// Fully dynamic
e('div', { style: { color: dp((vs) => vs.color), width: dp((vs) => vs.width) } })

// Mixed static/dynamic
e('div', { style: { margin: '10px', color: dp((vs) => vs.color), padding: '20px' } })

// Kebab-case conversion + template string
e('div', { style: { backgroundColor: dp((vs) => vs.color), fontSize: dp((vs) => `${vs.fontSize}px`) } })

// Fully static (optimized)
e('div', { style: { cssText: 'background: red; padding: 10px' } })
```

## Future Considerations

- CSS-in-JS style objects: `style="{styleObject}"` to pass entire style object
- CSS custom properties: `style="--theme-color: {color}"` for CSS variables
- Animation/transition support: May need special handling for timing values
- Ternary operators in style values: Current expression parser doesn't support ternary in property expressions (only in class expressions)


