# Design Log 47 - Recursive HTML Context Switching

## Problem Statement

The current recursive HTML design (Design Log 46) has a fundamental limitation when the recursive structure needs to operate on a nested type that differs from the root context type.

### The Core Issue

Consider this data structure:

```yaml
data:
  tree:
    - id: string
      name: string
      hasChildren: boolean
      isOpen: boolean
      children: $/data/tree # References the tree array type
```

When we try to create a recursive region, we encounter a context mismatch:

```html
<ul class="menu-list" ref="menuItem">
  <li forEach="tree" trackBy="id">
    <a href="#">
      <span class="name">{name}</span>
    </a>
    <div if="hasChildren && isOpen">
      <recurse ref="menuItem" />
    </div>
  </li>
</ul>
```

**The Problem:**

1. The `ref="menuItem"` is at the root context where `tree` is a property
2. The `forEach="tree"` iterates over the tree items
3. When we recurse, we need to iterate over `children`, not `tree`
4. But `children` is not accessible at the root context
5. The recursive region needs to work with both `tree` (initially) and `children` (on recursion)

**Why This Fails:**

- At the `ref="menuItem"` level, the ViewState type is `IndirectRecursion2ViewState` (which has `tree` property)
- Inside `forEach="tree"`, the ViewState type is `TreeOfIndirectRecursion2ViewState` (which has `children` property)
- The recursive region function needs a consistent type to operate on
- We can't write `forEach="tree"` AND `forEach="children"` in the same template

### Current Workaround Attempts

#### Attempt 1: Put ref inside forEach

```html
<ul class="menu-list">
  <li forEach="tree" trackBy="id" ref="menuItem">
    <a href="#"><span class="name">{name}</span></a>
    <div if="hasChildren && isOpen">
      <recurse ref="menuItem" />
    </div>
  </li>
</ul>
```

**Problem**: The ref is now on a `forEach` element, which creates a collection of refs instead of a single ref. The recursive region would need to iterate, but we're already in an iteration context.

#### Attempt 2: Use accessor on recurse

```html
<ul class="menu-list" ref="menuItem">
  <li forEach="tree" trackBy="id">
    <a href="#"><span class="name">{name}</span></a>
    <div if="hasChildren && isOpen">
      <recurse ref="menuItem" accessor="children" />
    </div>
  </li>
</ul>
```

**Problem**: The `accessor="children"` would use `withData` to switch to the children array, but the recursive function still expects to receive `tree` initially and `children` on recursion. The mismatch persists.

## Root Cause Analysis

The fundamental issue is a **context type mismatch between initialization and recursion**:

1. **Initialization Phase**: The recursive region is called with the root ViewState type

   - Needs to access `tree` array
   - `forEach="tree"` makes sense here

2. **Recursion Phase**: The recursive region is called with the tree item type

   - Needs to access `children` array
   - `forEach="children"` makes sense here

3. **The Conflict**: We can't write both in a single template because:
   - `ref="menuItem"` establishes the recursive region boundary
   - The region's ViewState type is fixed at compile time
   - We need the region to work with _different accessor paths_ depending on how it's invoked

### Why This Is a Design Problem

This isn't a bug in the implementation—it's a fundamental limitation in the design:

- Recursive regions assume the type structure is **isomorphic** (same shape at every level)
- Direct recursion (`children: array<$/data>`) creates isomorphic structures
- Indirect recursion through different paths (`tree` vs `children`) creates **non-isomorphic** structures
- The current design doesn't have a way to "reset" the context to normalize the type

## Proposed Solution: Context Reset Element

Introduce a mechanism to reset the ViewState context to a specific type before entering the recursive region.

### Design Goals

1. **Context Normalization**: Allow resetting the context from root type to recursive item type
2. **Explicit**: The context switch should be clearly visible in the HTML
3. **Type-Safe**: The compiler should validate that the accessor resolves to the correct type
4. **Minimal New Syntax**: Reuse existing concepts where possible

### Syntax Options

#### Option 1: `<with-data>` Element

```html
<with-data accessor="tree">
  <ul class="menu-list" ref="menuItem">
    <li forEach="." trackBy="id">
      <a href="#"><span class="name">{name}</span></a>
      <div if="hasChildren && isOpen">
        <recurse ref="menuItem" accessor="children" />
      </div>
    </li>
  </ul>
</with-data>
```

**Semantics:**

- `<with-data accessor="tree">` switches context to the `tree` array type
- Inside, `forEach="."` means "iterate over the current context" (the array itself)
- On recursion, `accessor="children"` switches to the children array
- Both forEach operate on arrays, just accessed differently

**Advantages:**

- Clear and explicit context boundary
- Reuses the `withData` concept from the runtime
- `forEach="."` is intuitive ("this" in programming)

**Disadvantages:**

- Introduces a new HTML element

#### Option 2: `context` Attribute

```html
<ul class="menu-list" context="tree" ref="menuItem">
  <li forEach="." trackBy="id">
    <a href="#"><span class="name">{name}</span></a>
    <div if="hasChildren && isOpen">
      <recurse ref="menuItem" accessor="children" />
    </div>
  </li>
</ul>
```

**Advantages:**

- No new elements, just an attribute
- More compact

**Disadvantages:**

- Less explicit about the context boundary
- Mixing `context` and `ref` on the same element might be confusing

#### Option 3: `<recurse-root>` Element

```html
<recurse-root accessor="tree">
  <ul class="menu-list" ref="menuItem">
    <li forEach="." trackBy="id">
      <a href="#"><span class="name">{name}</span></a>
      <div if="hasChildren && isOpen">
        <recurse ref="menuItem" accessor="children" />
      </div>
    </li>
  </ul>
</recurse-root>
```

**Advantages:**

- Explicitly names it as related to recursion
- Clear boundary

**Disadvantages:**

- More verbose
- The name might imply it's required for all recursion (it's not)

### Recommended: `<with-data>` Element

The `<with-data>` element provides the clearest semantics and matches the runtime behavior most closely.

## Detailed Design

### HTML Syntax

```html
<with-data accessor="expression">
  <!-- Content here operates in the switched context -->
</with-data>
```

**Rules:**

1. The `accessor` attribute is required and must resolve to a valid type
2. Inside `<with-data>`, the ViewState context is the resolved type
3. `forEach="."` inside `<with-data>` means "iterate over the current context"
4. `<with-data>` can be nested for multiple context switches
5. `<with-data>` can wrap a recursive region to normalize its entry type

### Example: Menu with Nested Submenus

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        tree:
        - id: string
          name: string
          hasChildren: boolean
          isOpen: boolean
          children: $/data/tree
    </script>
  </head>
  <body>
    <nav class="menu">
      <!-- Switch context to the tree array -->
      <with-data accessor="tree">
        <ul class="menu-list" ref="menuItem">
          <!-- Now forEach="." iterates over the current context (tree array) -->
          <li forEach="." trackBy="id">
            <a href="#">
              <span class="name">{name}</span>
            </a>
            <div if="hasChildren && isOpen">
              <!-- Recurse with children accessor -->
              <recurse ref="menuItem" accessor="children" />
            </div>
          </li>
        </ul>
      </with-data>
    </nav>
  </body>
</html>
```

### How It Works

#### Initial Render

1. Root ViewState is `IndirectRecursion2ViewState` with `tree: Array<TreeItem>`
2. `<with-data accessor="tree">` switches context to `Array<TreeItem>`
3. Inside, the recursive region `ref="menuItem"` operates on `Array<TreeItem>`
4. `forEach="."` iterates over the array (current context)
5. Each item has type `TreeItem` with `children: Array<TreeItem>`

#### Recursive Call

1. Inside forEach, context is `TreeItem`
2. `<recurse ref="menuItem" accessor="children"/>` uses `withData` to switch to `children` array
3. The recursive function receives `Array<TreeItem>` (same type as initial)
4. Inside the recursive function, `forEach="."` iterates over this array
5. Recursion continues with consistent types

### Generated TypeScript

```typescript
export interface TreeOfIndirectRecursion2ViewState {
  id: string;
  name: string;
  hasChildren: boolean;
  isOpen: boolean;
  children: Array<TreeOfIndirectRecursion2ViewState> | null;
}

export interface IndirectRecursion2ViewState {
  tree: Array<TreeOfIndirectRecursion2ViewState>;
}

export function render(options?: RenderElementOptions): IndirectRecursion2ElementPreRender {
  const [refManager, [refMenuItem]] = ReferencesManager.for(options, [], ['menuItem'], [], []);

  // Recursive function operates on the array type
  function renderRecursiveRegion_menuItem(): BaseJayElement<
    Array<TreeOfIndirectRecursion2ViewState>
  > {
    return de(
      'ul',
      { class: 'menu-list' },
      [
        forEach(
          // forEach="." becomes identity function
          (vs: Array<TreeOfIndirectRecursion2ViewState>) => vs,
          (vs1: TreeOfIndirectRecursion2ViewState) => {
            return de('li', {}, [
              e('a', { href: '#' }, [e('span', { class: 'name' }, [dt((vs1) => vs1.name)])]),
              c(
                (vs1) => vs1.hasChildren && vs1.isOpen,
                () =>
                  e('div', {}, [
                    // accessor="children" uses withData
                    withData(
                      (vs1) => vs1.children,
                      () => renderRecursiveRegion_menuItem(),
                    ),
                  ]),
              ),
            ]);
          },
          'id',
        ),
      ],
      refMenuItem(),
    );
  }

  const render = (viewState: IndirectRecursion2ViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('nav', { class: 'menu' }, [
        // accessor="tree" uses withData
        withData(
          (vs) => vs.tree,
          () => renderRecursiveRegion_menuItem(),
        ),
      ]),
    ) as IndirectRecursion2Element;

  return [refManager.getPublicAPI() as IndirectRecursion2ElementRefs, render];
}
```

### Key Insights

1. **Type Consistency**: The recursive function always receives `Array<TreeItem>`, whether called initially or recursively
2. **Context Switching**: `<with-data>` generates `withData()` calls that handle the context switch
3. **Identity forEach**: `forEach="."` compiles to an identity function `(vs) => vs`
4. **Accessor Chain**: Initial call uses `withData((vs) => vs.tree, ...)`, recursive calls use `withData((vs1) => vs1.children, ...)`

## Implementation Steps

###1. Parser Changes

Add support for `<with-data>` element:

```typescript
// In jay-html-helpers.ts
export function isWithData(element: HTMLElement): boolean {
  return element.rawTagName === 'with-data';
}
```

### 2. Compiler Changes

Handle `<with-data>` elements in the compiler:

```typescript
if (isWithData(htmlElement)) {
  const accessor = htmlElement.getAttribute('accessor');
  if (!accessor) {
    return new RenderFragment('', Imports.none(), [
      '<with-data> element must have an "accessor" attribute',
    ]);
  }

  // Parse the accessor
  const accessorExpr = parseAccessor(accessor, variables);

  // Create new variables context with the resolved type
  const newVariables = variables.childVariableFor(accessorExpr);

  // Render children with new context
  const childElement = renderHtmlElement(htmlElement, {
    ...context,
    variables: newVariables,
  });

  // Wrap in withData call
  return new RenderFragment(
    `withData(${accessorExpr.render().rendered}, () => ${childElement.rendered})`,
    childElement.imports.plus(Import.withData),
    [...accessorExpr.validations, ...childElement.validations],
    childElement.refs,
    childElement.recursiveRegions,
  );
}
```

### 3. Special Handling for `forEach="."`

When accessor is just ".", it means the current context:

```typescript
if (forEach === '.') {
  // Identity function - iterate over current context
  forEachFragment = new RenderFragment(
    `(${variables.currentVar}: ${variables.currentType.name}) => ${variables.currentVar}`,
    Imports.none(),
    [],
  );
} else {
  // Normal accessor parsing
  const forEachAccessor = parseAccessor(forEach, variables);
  forEachFragment = forEachAccessor.render().map((_) => `(${paramName}: ${paramType}) => ${_}`);
}
```

### 4. Update Recursive Type Resolution

The parser needs to understand that `children: $/data/tree` creates a `JayRecursiveType` that resolves to the array at `data.tree`:

```typescript
// In resolveRecursiveReferences
if (type instanceof JayRecursiveType) {
  const parts = type.referencePath.split('/').filter((p) => p);

  if (parts.length >= 2 && parts[0] === '$' && parts[1] === 'data') {
    let resolvedType: JayType = rootType;

    // Navigate to the target type
    for (let i = 2; i < parts.length; i++) {
      const pathSegment = parts[i];
      if (resolvedType instanceof JayObjectType && pathSegment in resolvedType.props) {
        resolvedType = resolvedType.props[pathSegment];
      } else if (resolvedType instanceof JayArrayType) {
        if (
          resolvedType.itemType instanceof JayObjectType &&
          pathSegment in resolvedType.itemType.props
        ) {
          resolvedType = resolvedType.itemType.props[pathSegment];
        } else {
          return; // Path not found
        }
      } else {
        return; // Path not found
      }
    }

    type.resolvedType = resolvedType;
  }
}
```

## Benefits

1. **Solves Context Mismatch**: Allows recursive regions to operate on consistent types
2. **Explicit**: The context switch is clearly visible in the HTML
3. **Flexible**: Can be used for non-recursive context switching too
4. **Type-Safe**: Compiler validates accessor expressions
5. **Runtime Support**: Maps directly to existing `withData` runtime function
6. **Composable**: Can nest multiple `<with-data>` elements

## Migration Path

Existing recursive HTML that doesn't need context switching continues to work unchanged. The `<with-data>` element is only needed when the recursive structure's entry point differs from its recursive point.

**Before (doesn't work):**

```html
<ul ref="menuItem">
  <li forEach="tree" trackBy="id">
    <recurse ref="menuItem" accessor="children" />
  </li>
</ul>
```

**After (works):**

```html
<with-data accessor="tree">
  <ul ref="menuItem">
    <li forEach="." trackBy="id">
      <recurse ref="menuItem" accessor="children" />
    </li>
  </ul>
</with-data>
```

## Conclusion

The `<with-data>` element provides a clean, explicit way to handle context switching in recursive HTML structures. It solves the fundamental problem of type mismatch between initialization and recursion paths, while maintaining type safety and clarity. The syntax maps naturally to the existing `withData` runtime function, making implementation straightforward.
