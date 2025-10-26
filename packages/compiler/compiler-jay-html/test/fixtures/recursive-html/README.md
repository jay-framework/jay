# Recursive Jay-HTML Test Fixtures

These fixtures test the new recursive jay-html feature as designed in Design Log 46.

## Feature Overview

The recursive jay-html feature allows marking HTML subtrees as recursive regions using:

- `ref="regionName"` on an element to mark it as a recursive region
- `<recurse ref="regionName" />` to trigger recursion at that point
- `array<$/data>` type syntax to define recursive type references

## Test Cases

### 1. `simple-tree/`

**Tests:** Basic direct recursion with a simple tree structure

**Key Features:**

- Direct recursion: `children: array<$/data>`
- Recursive region marked with `ref="treeNode"`
- Recursion triggered in `forEach` with `<recurse ref="treeNode" />`
- Has a ref within the recursive region (`nodeHeader`)
- Conditional rendering with `if="open"`

### 2. `indirect-recursion/`

**Tests:** Indirect recursion through a nested container object

**Key Features:**

- Indirect recursion: `submenu.items: array<$/data>`
- The recursion doesn't happen directly on the root type
- Demonstrates type generation for nested containers with recursive arrays
- Combined conditional: `if="hasSubmenu && isOpen"`

### 3. `tree-with-conditional/`

**Tests:** Recursive structure with enum types and complex conditionals

**Key Features:**

- Enum type usage: `type: enum (file | folder)`
- Conditional recursion based on enum: `if="type == folder && isExpanded"`
- Demonstrates enum code generation in recursive contexts
- Shows how enum comparisons work in recursive regions

### 4. `nested-comments/`

**Tests:** Classic nested comments/replies pattern

**Key Features:**

- Simple direct recursion for comment threads
- Button ref within recursive region (`toggleReplies`)
- Demonstrates real-world use case (threaded comments)
- Clean parent-child relationship pattern

### 5. `linked-list/`

**Tests:** Recursive conditional without arrays (single optional child)

**Key Features:**

- Non-array recursion: `next: $/data` (not an array!)
- Linked list pattern with optional next node
- Recursion guard is conditional only (no forEach)
- Type generation: `next: LinkedListViewState | null`
- Demonstrates single-child recursive structures

### 6. `binary-tree/`

**Tests:** Multiple recursive conditionals (left/right children)

**Key Features:**

- Multiple non-array recursive references: `left: $/data`, `right: $/data`
- Binary tree pattern with optional left and right children
- Two separate conditional recursions in same region
- Type generation: nullable optional children
- Demonstrates branching recursive structures

## Expected Generated Code Pattern

Each test expects code generation following this pattern:

```typescript
// 1. Recursive ViewState type with self-reference
export interface TreeViewState {
  // ... properties
  children: Array<TreeViewState>; // Self-referencing array
}

// 2. Internal recursive render function
function renderRecursiveRegion_<refName>(data: TreeViewState) {
  return e('div', {}, [
    // ... element structure
    forEach(
      (vs) => vs.children,
      (childData) => {
        return e('li', {}, [
          renderRecursiveRegion_<refName>(childData), // Recursive call
        ]);
      },
      'trackByKey',
    ),
  ]);
}

// 3. Main render function that calls the recursive function
const render = (viewState: TreeViewState) =>
  ConstructContext.withRootContext(viewState, refManager, () =>
    e('div', {}, [
      // Non-recursive content
      renderRecursiveRegion_<refName>(viewState), // Initial call
    ]),
  ) as TreeElement;
```

## Validation Rules Being Tested

1. **Recursion Guards**: Each `<recurse>` must be inside a `forEach` or conditional
   - forEach guard: Tests 1-4 (array-based recursion)
   - Conditional guard: Tests 5-6 (non-array recursion)
2. **Type Consistency**: The array/property type must match the recursive type reference
   - Array recursion: `array<$/data>` → `Array<ViewState>`
   - Single recursion: `$/data` → `ViewState | null`
3. **Valid Region References**: `<recurse ref="name">` must reference an existing `ref="name"` element
4. **Descendant Requirement**: `<recurse>` must be a descendant of the referenced region

## Not Yet Tested

These fixtures do **not** yet test:

- Multiple recursive regions in one component
- Referencing nested types (`array<$/data/metadata>`)
- Error cases (missing guards, invalid references, etc.)
- React target generation for recursive structures
- Contract file recursion with `link: $/`

Additional test fixtures should be added for these scenarios.
