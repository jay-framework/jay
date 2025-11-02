# Binary Tree Recursive Example

This example demonstrates Jay's **recursive Jay-HTML templates** feature for visualizing a binary tree structure with accessor-based recursion.

## Features

- **Recursive Templates with Accessors**: Uses `accessor` attribute to specify left/right children
- **Single Optional Children**: Uses `$/data` (not in an array) for nullable references
- **Logical Operators**: Uses `||` operator (`hasLeft || hasRight`)
- **Visual Tree Layout**: CSS-based tree visualization with connecting lines

## Key Concepts

### Recursive Data Type with Accessors

```yaml
data:
  value: number
  id: string
  hasLeft: boolean
  hasRight: boolean
  left: $/data # Single optional child (left)
  right: $/data # Single optional child (right)
```

The `$/data` syntax (without `array<>`) creates a nullable recursive reference. This is perfect for binary tree nodes where each node can have at most one left and one right child.

### Recursive Template with Accessors

```html
<div class="btree-node" ref="treeNode">
  <div class="node-container">
    <div ref="nodeValue" class="node-value">{value}</div>
  </div>
  <div class="node-children" if="hasLeft || hasRight">
    <div class="child-branch left-branch" if="hasLeft">
      <div class="branch-line"></div>
      <recurse ref="treeNode" accessor="left" />
      <!-- Left subtree -->
    </div>
    <div class="child-branch right-branch" if="hasRight">
      <div class="branch-line"></div>
      <recurse ref="treeNode" accessor="right" />
      <!-- Right subtree -->
    </div>
  </div>
</div>
```

The `accessor` attribute tells the compiler which property to use for recursion:

- `accessor="left"` uses the `left` property
- `accessor="right"` uses the `right` property

### Generated Runtime Code

The compiler generates `withData` calls for accessor-based recursion:

```typescript
withData(
  (vs) => vs.left,
  () => renderRecursiveRegion_treeNode(),
);
withData(
  (vs) => vs.right,
  () => renderRecursiveRegion_treeNode(),
);
```

This ensures proper context switching and handles null values automatically.

## Running the Example

```bash
# Install dependencies
yarn install

# Generate TypeScript definitions
yarn definitions

# Build and serve
yarn build:watch
```

## Comparison with Tree-Recursive Example

### Tree-Recursive (Array-based)

- Uses `array<$/data>` for multiple children
- Uses `forEach` to iterate children
- No `accessor` attribute needed
- Generates static `e()` elements in forEach

### BTree-Recursive (Accessor-based)

- Uses `$/data` for single optional children
- Uses `if` conditionals for left/right
- Requires `accessor` attribute to specify which child
- Generates `withData()` for context switching

## Tree Structure Example

The example creates this binary search tree:

```
        50
       /  \
      30   70
     / \   / \
   20  40 60  80
   /       \
  10       65
```

Each node is rendered recursively using the same template, demonstrating the power of recursive Jay-HTML templates for hierarchical data structures.

