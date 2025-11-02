# Tree Recursive Example

This example demonstrates Jay's **recursive Jay-HTML templates** feature for building a collapsible tree structure.

## Features

- **Recursive Templates**: Uses the `<recurse>` element to create self-referencing components
- **Array Recursion**: Leverages `forEach` with `array<$/data>` for children
- **Logical Operators**: Uses `&&` operator in conditions (`hasChildren && open`)
- **Interactive UI**: Click-to-expand/collapse nodes

## Key Concepts

### Recursive Data Type

```yaml
data:
  name: string
  id: string
  open: boolean
  hasChildren: boolean
  children: array<$/data> # Self-referencing array
```

The `array<$/data>` syntax creates a recursive type reference where each child has the same structure as the parent.

### Recursive Template

```html
<div class="tree-node" ref="treeNode">
  <div ref="head" class="tree-head">
    <span class="tree-arrow" if="hasChildren && open">▼</span>
    <span class="tree-arrow" if="hasChildren && !open">►</span>
    <span class="tree-arrow" if="!hasChildren"> </span>
    <span class="tree-name">{name}</span>
  </div>
  <ul if="open" class="tree-children">
    <li forEach="children" trackBy="id">
      <recurse ref="treeNode" />
      <!-- Recursive call -->
    </li>
  </ul>
</div>
```

The `<recurse ref="treeNode" />` element creates a recursive call, rendering the same template for each child node.

## Running the Example

```bash
# Install dependencies
yarn install

# Generate TypeScript definitions
yarn definitions

# Build and serve
yarn build:watch
```

## Comparison with Original Tree Example

The original `tree` example uses **component recursion** with explicit component imports:

```html
<TreeNode props="{.}" />
```

This `tree-recursive` example uses **template recursion** with the `<recurse>` element:

```html
<recurse ref="treeNode" />
```

### Benefits of Recursive Templates

1. **Simpler**: No need to import and reference the component
2. **More explicit**: Clear recursive boundary with `ref` attribute
3. **Single file**: Everything in one Jay-HTML file
4. **Type safety**: Automatic recursive type generation

