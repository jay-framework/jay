# Design Log 46 - Recursive Jay-HTML

## Problem Statement

Jay-HTML currently doesn't support recursive HTML structures natively. To create recursive UIs like trees, developers must create separate components and import them into themselves. This approach works but has limitations:

1. **Forces component extraction**: Even for a single large HTML structure with one recursive section, you must extract it into a separate component
2. **Requires explicit component import**: Components must import themselves using `<script type="application/jay-headfull" src="./self" names="Self">`, which feels unnatural
3. **Type complexity**: The recursive type structure requires careful TypeScript type definitions
4. **Design tool challenges**: Design tools would need to understand and generate these self-imports, which is not intuitive for a single HTML structure
5. **Verbosity**: Extra boilerplate is needed for what should be a natural recursive pattern within a single HTML document

### Current Workaround Example

The current tree example (`jay/examples/jay/tree/lib/tree-node.jay-html`) requires splitting into a separate component:

```html
<html>
  <head>
    <!-- Component imports itself -->
    <script type="application/jay-headfull" src="./tree-node" names="TreeNode, Node"></script>
    <script type="application/jay-data">
      data:
        headChar: string
        node: Node
        open: boolean
    </script>
  </head>
  <body>
    <div>
      <div ref="head">
        <span class="tree-arrow">{headChar}</span>
        <span>{node.name}</span>
      </div>
      <ul if="open">
        <li forEach="node.children" trackBy="id">
          <!-- Uses itself as a component -->
          <TreeNode props="{.}" />
        </li>
      </ul>
    </div>
  </body>
</html>
```

**The Challenge**: You can't define a single component with a large HTML structure where just one subtree is recursive. You're forced to extract that subtree into a separate component.

## Goals

Design a native recursive jay-html syntax that:

1. **Allows marking HTML subtrees as recursive**: A specific section of HTML can repeat recursively without extracting it into a separate component
2. **Prevents infinite recursion**: Requires a conditional or forEach to guard recursion
3. **Works with design tools**: Can be easily generated and understood by design tools
4. **Maintains type safety**: Generates correct TypeScript types for recursive structures
5. **Keeps HTML structure intact**: The entire HTML hierarchy stays in one file

## Design Proposal

The key insight is to define **recursive regions** - marked sections of HTML that should repeat for nested data structures. The recursion happens at the HTML subtree level, not at the component level.

### Syntax Option 1: `recursive-region` with Named Regions

Define a named recursive region that can be referenced within itself.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        name: string
        id: string
        open: boolean
        children: array<$/data>
    </script>
  </head>
  <body>
    <div class="tree-container">
      <h1>File Browser</h1>

      <!-- Define the recursive region -->
      <recursive-region name="treeNode">
        <div class="node">
          <div ref="head" class="node-header">
            <span class="tree-arrow">{open ? '▼' : '►'}</span>
            <span>{name}</span>
          </div>
          <ul if="open" class="children">
            <li forEach="children" trackBy="id">
              <!-- Recurse by referencing the region by name -->
              <recurse region="treeNode" />
            </li>
          </ul>
        </div>
      </recursive-region>
    </div>
  </body>
</html>
```

**Advantages:**

- Explicit region boundaries
- Named regions are clear and self-documenting
- Can potentially have multiple recursive regions in one component

**Disadvantages:**

- More verbose syntax
- Two new elements (`recursive-region` and `recurse`)

### Syntax Option 2: `recursive` Attribute

Mark an element with a `recursive` attribute to indicate that this subtree should recursively render for nested data.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        name: string
        id: string
        open: boolean
        children: array<$/data>
    </script>
  </head>
  <body>
    <div class="tree-container">
      <h1>File Browser</h1>

      <!-- Mark the subtree as recursive -->
      <div class="node" recursive>
        <div ref="head" class="node-header">
          <span class="tree-arrow">{open ? '▼' : '►'}</span>
          <span>{name}</span>
        </div>
        <ul if="open" class="children">
          <li forEach="children" trackBy="id">
            <!-- Content automatically recurses - the <div class="node" recursive> subtree repeats here -->
          </li>
        </ul>
      </div>
    </div>
  </body>
</html>
```

**Advantages:**

- Clean, minimal syntax
- No new elements, just an attribute
- The recursion point (forEach) implicitly triggers the recursive rendering
- Clear visual boundary of what repeats

**Disadvantages:**

- Implicit behavior (subtree repeats at forEach without explicit marker)
- Need clear rules about where recursion happens

### Syntax Option 3: `recursive-region` Attribute + `<recurse>` Element

The element marked with a `recursive-region` attribute defines the boundary, and `<recurse>` elements within it trigger repetition.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        name: string
        id: string
        open: boolean
        children: array<$/data>
    </script>
  </head>
  <body>
    <div class="tree-container">
      <h1>File Browser</h1>

      <!-- Mark the recursive region boundary -->
      <div class="node" recursive-region>
        <div ref="head" class="node-header">
          <span class="tree-arrow">{open ? '▼' : '►'}</span>
          <span>{name}</span>
        </div>
        <ul if="open" class="children">
          <li forEach="children" trackBy="id">
            <!-- Explicitly recurse the region -->
            <recurse />
          </li>
        </ul>
      </div>
    </div>
  </body>
</html>
```

**Advantages:**

- Clear boundaries with `recursive-region`
- Explicit recursion point with `<recurse>`
- Intuitive: "recurse the region I'm inside"

**Disadvantages:**

- Two new concepts (attribute and element)
- Implicit region reference (which region does `<recurse>` refer to?)

### Syntax Option 4: `ref` Attribute on Recursive Regions (Recommended)

Use Jay's existing `ref` system to mark and reference recursive regions. A region becomes recursive simply by being referenced by a `<recurse>` element.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        name: string
        id: string
        open: boolean
        children: array<$/data>
    </script>
  </head>
  <body>
    <div class="tree-container">
      <h1>File Browser</h1>

      <!-- Use ref to mark the region - becomes recursive because it's referenced by <recurse> -->
      <div class="node" ref="treeNode">
        <div ref="head" class="node-header">
          <span class="tree-arrow">{open ? '▼' : '►'}</span>
          <span>{name}</span>
        </div>
        <ul if="open" class="children">
          <li forEach="children" trackBy="id">
            <!-- Explicitly reference which region to recurse -->
            <recurse ref="treeNode" />
          </li>
        </ul>
      </div>
    </div>
  </body>
</html>
```

**Advantages:**

- Reuses existing `ref` concept that Jay developers already understand
- No special syntax needed - just regular `ref="name"`
- Explicit: `<recurse ref="treeNode">` clearly shows what's being recursed
- Allows multiple recursive regions with clear references
- Consistent with Jay's design patterns
- Compiler infers recursion from usage

**Disadvantages:**

- None significant - this is the cleanest approach

## Recommended Approach: `ref` on Recursive Regions

Using the `ref` system provides the best integration with Jay's existing patterns. The syntax is explicit, familiar, and allows for clear references when recursing.

### Syntax

Simply use regular `ref` attributes to mark regions, and `<recurse ref="name">` to trigger recursion:

```html
<div ref="regionName">
  ...
  <recurse ref="regionName" />
</div>
```

The compiler automatically detects that a ref marks a recursive region when it finds a `<recurse>` element referencing it. No special syntax or attributes needed beyond standard Jay `ref`.

### Key Features

1. **Reuses Familiar Concepts**: Uses Jay's existing `ref` system, making it intuitive for developers
2. **Explicit References**: `<recurse ref="regionName">` clearly shows which region repeats

3. **Multiple Recursive Regions**: A component can have multiple recursive regions, each with a unique ref name

4. **Type References**: Uses `array<$/data>` syntax to explicitly define recursive types

   - `$/data` references the root data type
   - `$/data/path/to/type` references nested types
   - Inspired by JSON Schema `$ref`, using `$` prefix (instead of `#` which is YAML comment syntax)
   - Path notation follows JSON Pointer style (RFC 6901)

5. **Type Safety**: The data type within `forEach` that contains `<recurse>` must match the referenced type (e.g., `array<$/data>`)

6. **Recursion Guards**: The compiler validates that `<recurse>` appears inside a `forEach` or conditional to prevent infinite recursion

### Compiler Implementation

#### Detection Phase

1. First pass: Find all `<recurse ref="name">` elements in the template
2. For each `<recurse>` element, find the corresponding element with `ref="name"` - this marks a recursive region
3. Validate references:
   - Each `<recurse ref="name">` must reference an existing `ref="name"` element
   - Emit compilation error if the referenced ref doesn't exist
   - The `<recurse>` must be a descendant (nested within) the referenced region
4. Validate recursion guards:
   - Each `<recurse>` must be inside a `forEach` or have an ancestor with `if`
   - Emit compilation error if no guard exists
5. Extract each recursive region as a separate internal render function
6. Regular refs (not referenced by `<recurse>`) work normally and generate standard ref types

#### Type Generation

For a recursive HTML region, the ViewState must support the recursive structure using JSON Schema-style references.

**Solution**: Use `array<$/data>` syntax (inspired by JSON Schema `$ref`) to reference types within the data structure. We use `$` prefix instead of `#` since `#` starts comments in YAML:

##### Direct Recursion

```yaml
# Input jay-html with recursive structure
data:
  name: string
  id: string
  children: array<$/data> # References the root data type
```

```typescript
// Generated TypeScript
export interface TreeViewState {
  name: string;
  id: string;
  children: Array<TreeViewState>; // Recursive reference to root
}
```

##### Indirect Recursion Through Container

```yaml
data:
  name: string
  id: string
  childContainer:
    items: array<$/data> # Still references root data type
```

Generates:

```typescript
export interface TreeViewState {
  name: string;
  id: string;
  childContainer: {
    items: Array<TreeViewState>; // Recursive reference to root type
  };
}
```

##### Referencing Nested Types

You can reference any nested type within the data structure:

```yaml
data:
  name: string
  metadata:
    title: string
    category: string
  children: array<$/data> # References root type
  relatedItems: array<$/data/metadata> # References nested metadata type
```

Generates:

```typescript
export interface MetadataOfTreeViewState {
  title: string;
  category: string;
}

export interface TreeViewState {
  name: string;
  metadata: MetadataOfTreeViewState;
  children: Array<TreeViewState>; // References root
  relatedItems: Array<MetadataOfTreeViewState>; // References nested type
}
```

**Reference Syntax:**

- `$/data` - References the root data type
- `$/data/path/to/type` - References a nested type within the data structure
- Uses `$` prefix (inspired by JSON Schema `$ref`) instead of `#` to avoid YAML comment syntax
- Path notation follows JSON Pointer style (RFC 6901)

##### Non-Array Recursion (Single Optional Children)

Recursion doesn't always require arrays. You can have single optional recursive references:

**Linked List Pattern:**

```yaml
data:
  value: string
  id: string
  next: $/data # Single optional recursive reference (not an array!)
```

Generates:

```typescript
export interface LinkedListViewState {
  value: string;
  id: string;
  next: LinkedListViewState | null; // Nullable type for optional recursion
}
```

**Binary Tree Pattern:**

```yaml
data:
  value: number
  id: string
  left: $/data # Optional left child
  right: $/data # Optional right child
```

Generates:

```typescript
export interface BinaryTreeViewState {
  value: number;
  id: string;
  left: BinaryTreeViewState | null;
  right: BinaryTreeViewState | null;
}
```

**Type Generation Rules:**

- `array<$/data>` → `Array<ViewState>` (for forEach loops)
- `$/data` → `ViewState | null` (for conditionals with single children)
- Non-array recursion requires conditional guards instead of forEach
- Multiple optional children can exist in the same structure

**Example Usage:**

```html
<div class="linked-list">
  <div class="node" ref="listNode">
    <span>{value}</span>
    <div class="next" if="next">
      <recurse ref="listNode" />
      <!-- Guarded by conditional, not forEach -->
    </div>
  </div>
</div>
```

#### Code Generation

The recursive region should compile to an internal render function that can call itself:

**Example Input Jay-HTML:**

```html
<div class="tree-container">
  <h1>{title}</h1>

  <div class="node" ref="treeNode">
    <div ref="head" class="node-header">
      <span>{name}</span>
    </div>
    <ul if="open">
      <li forEach="children" trackBy="id">
        <recurse ref="treeNode" />
      </li>
    </ul>
  </div>
</div>
```

**Generated TypeScript Code:**

```typescript
import {
  JayElement,
  element as e,
  dynamicText as dt,
  dynamicElement as de,
  conditional as c,
  forEach,
  RenderElement,
  ReferencesManager,
  ConstructContext,
  HTMLElementProxy,
  RenderElementOptions,
  JayContract,
} from '@jay-framework/runtime';

export interface TreeViewState {
  title: string;
  name: string;
  id: string;
  open: boolean;
  children: Array<TreeViewState>;
}

export interface TreeElementRefs {
  head: HTMLElementProxy<TreeViewState, HTMLDivElement>;
}

export type TreeElement = JayElement<TreeViewState, TreeElementRefs>;
export type TreeElementRender = RenderElement<TreeViewState, TreeElementRefs, TreeElement>;
export type TreeElementPreRender = [TreeElementRefs, TreeElementRender];
export type TreeContract = JayContract<TreeViewState, TreeElementRefs>;

export function render(options?: RenderElementOptions): TreeElementPreRender {
  // Setup refs - head is a regular ref in the recursive region
  const [refManager, [refHead]] = ReferencesManager.for(options, ['head'], [], [], []);

  // Internal recursive render function for the region marked with ref="treeNode"
  function renderRecursiveRegion_treeNode(nodeData: TreeViewState) {
    return e('div', { class: 'node' }, [
      e('div', { class: 'node-header' }, [e('span', {}, [dt((vs) => vs.name)])], refHead()),
      c(
        (vs) => vs.open,
        () =>
          de('ul', {}, [
            forEach(
              (vs: TreeViewState) => vs.children,
              (childData: TreeViewState) => {
                return e('li', {}, [
                  // <recurse ref="treeNode" /> becomes a recursive call
                  renderRecursiveRegion_treeNode(childData),
                ]);
              },
              'id',
            ),
          ]),
      ),
    ]);
  }

  // Main render function
  const render = (viewState: TreeViewState) =>
    ConstructContext.withRootContext(viewState, refManager, () =>
      e('div', { class: 'tree-container' }, [
        e('h1', {}, [dt((vs) => vs.title)]),
        // Call the recursive region function with root viewState
        renderRecursiveRegion_treeNode(viewState),
      ]),
    ) as TreeElement;

  return [refManager.getPublicAPI() as TreeElementRefs, render];
}
```

**Key Points**:

- The recursive region (element with `ref="treeNode"`) becomes a separate internal function `renderRecursiveRegion_treeNode`
- The function takes a `TreeViewState` parameter (the recursive type)
- Within `forEach`, `<recurse ref="treeNode" />` compiles to `renderRecursiveRegion_treeNode(childData)`
- The function is called recursively as it renders child data
- Refs within the recursive region work normally (like `refHead()`)
- The main render function calls the recursive function with the root viewState
- Uses Jay's functional API: `e()` for elements, `dt()` for dynamic text, `c()` for conditionals, `forEach()` for collections

### Contract File Support

For headless components using `.jay-contract` files, recursive structures use JSON Schema-style references.

#### Direct Recursion

```yaml
name: tree-node
tags:
  - tag: name
    type: data
    dataType: string
  - tag: id
    type: data
    dataType: string
  - tag: open
    type: data
    dataType: boolean
  - tag: children
    type: sub-contract
    repeated: true
    link: $/ # References the root contract (self)
```

The `link: $/` references the root of the current contract, creating a recursive structure.

#### Indirect Recursion

```yaml
name: menu-item
tags:
  - tag: label
    type: data
    dataType: string
  - tag: id
    type: data
    dataType: string
  - tag: submenu
    type: sub-contract
    tags:
      - tag: items
        type: sub-contract
        repeated: true
        link: $/ # References root contract
```

#### Referencing Nested Sub-Contracts

You can reference specific nested contracts within the structure:

```yaml
name: complex-tree
tags:
  - tag: name
    type: data
    dataType: string
  - tag: metadata
    type: sub-contract
    tags:
      - tag: category
        type: data
        dataType: string
      - tag: tags
        type: data
        dataType: array
  - tag: children
    type: sub-contract
    repeated: true
    link: $/ # References root contract
  - tag: relatedMetadata
    type: sub-contract
    repeated: true
    link: $/metadata # References nested metadata sub-contract
```

**Contract Reference Syntax:**

- `link: $/` - References the root contract (self-reference)
- `link: $/path/to/subcontract` - References a nested sub-contract
- `link: ./external-contract` - References an external contract file (non-recursive)
- Uses `$` prefix (inspired by JSON Schema `$ref`) to avoid YAML comment syntax
- Path notation follows JSON Pointer style (RFC 6901)

### Validation Rules

1. **Recursion Guard Required**: `<recurse>` must be inside a `forEach` or have an ancestor with an `if` condition

   - Error: "Recursive <recurse> element must be guarded by forEach or conditional to prevent infinite recursion"

2. **Type Consistency**: The data type within `forEach` that contains `<recurse>` must match the referenced type (e.g., `array<$/data>` references root ViewState)

3. **Circular Type Detection**: The compiler should detect and support circular type references:

   ```typescript
   interface Node {
     children: Array<Node>; // Valid recursive type
   }
   ```

4. **Valid Region References**: Each `<recurse ref="name">` must reference an existing `ref="name"` element, and the `<recurse>` must be a descendant of that element

## Examples

### Example 1: File Browser with Tree Structure

A large component with header, toolbar, and a recursive file tree in one section.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        title: string
        currentPath: string
        name: string
        id: string
        type: enum (file | folder)
        isExpanded: boolean
        children: array<$/data>
    </script>
  </head>
  <body>
    <div class="file-browser">
      <!-- Non-recursive header section -->
      <header class="browser-header">
        <h1>{title}</h1>
        <div class="path-breadcrumb">{currentPath}</div>
        <div class="toolbar">
          <button ref="newFile">New File</button>
          <button ref="newFolder">New Folder</button>
          <button ref="refresh">Refresh</button>
        </div>
      </header>

      <!-- Recursive region for file tree -->
      <div class="file-tree">
        <div class="tree-item" ref="treeItem">
          <div ref="itemHeader" class="item-header">
            <span class="icon"> {type == folder ? (isExpanded ? '📂' : '📁') : '📄'} </span>
            <span class="name">{name}</span>
            <span class="size" if="type == file">{size}</span>
          </div>
          <div class="children" if="type == folder && isExpanded">
            <div forEach="children" trackBy="id">
              <recurse ref="treeItem" />
            </div>
          </div>
        </div>
      </div>

      <!-- Non-recursive footer section -->
      <footer class="browser-footer">
        <span class="item-count">{totalItems} items</span>
        <span class="selected">{selectedCount} selected</span>
      </footer>
    </div>
  </body>
</html>
```

**Key points:**

- Large HTML structure with header, tree, and footer
- Only the `.tree-item` section is recursive
- The rest of the HTML is rendered normally
- Uses regular `ref="treeItem"` - compiler detects it's recursive from the `<recurse ref="treeItem" />` usage

### Example 2: Discussion Board with Nested Comments

A comment section with thread controls, where only the comment structure is recursive.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        threadTitle: string
        threadAuthor: string
        postCount: number
        author: string
        text: string
        id: string
        timestamp: string
        showReplies: boolean
        replyCount: number
        replies: array<$/data>
    </script>
  </head>
  <body>
    <div class="discussion-thread">
      <!-- Thread header -->
      <header class="thread-header">
        <h1>{threadTitle}</h1>
        <div class="thread-meta">
          <span>Started by {threadAuthor}</span>
          <span>{postCount} posts</span>
        </div>
        <div class="thread-actions">
          <button ref="subscribe">Subscribe</button>
          <button ref="shareThread">Share</button>
        </div>
      </header>

      <!-- Recursive comment structure -->
      <div class="comments">
        <article class="comment" ref="comment">
          <div class="comment-header">
            <img src="{avatarUrl}" class="avatar" />
            <span class="author">{author}</span>
            <time class="timestamp">{timestamp}</time>
            <button ref="commentMenu" class="menu-button">⋮</button>
          </div>
          <div class="comment-body">
            <p class="comment-text">{text}</p>
          </div>
          <div class="comment-actions">
            <button ref="like">Like ({likeCount})</button>
            <button ref="reply">Reply</button>
            <button ref="toggleReplies" if="replyCount > 0">
              {showReplies ? 'Hide' : 'Show'} {replyCount} replies
            </button>
          </div>
          <div class="replies" if="showReplies && replyCount > 0">
            <div forEach="replies" trackBy="id">
              <recurse ref="comment" />
            </div>
          </div>
        </article>
      </div>

      <!-- Reply form at bottom -->
      <form class="reply-form">
        <textarea ref="replyInput" placeholder="Write a reply..."></textarea>
        <button ref="submitReply">Post Reply</button>
      </form>
    </div>
  </body>
</html>
```

**Key points:**

- Thread header and reply form are not recursive
- Only the comment article structure repeats for nested replies
- Keeps all UI in one component

### Example 3: Organization Chart

A company org chart with controls, where the employee card structure is recursive.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        companyName: string
        chartView: enum (hierarchy | flat)
        employeeName: string
        employeeId: string
        title: string
        department: string
        photoUrl: string
        isExpanded: boolean
        directReports: array<$/data>
    </script>
  </head>
  <body>
    <div class="org-chart">
      <!-- Chart controls -->
      <div class="chart-header">
        <h1>{companyName} Organization</h1>
        <div class="view-controls">
          <button ref="hierarchyView" class="{chartView == hierarchy ? 'active' : ''}">
            Hierarchy View
          </button>
          <button ref="flatView" class="{chartView == flat ? 'active' : ''}">Flat View</button>
        </div>
        <div class="chart-tools">
          <input ref="searchInput" placeholder="Search employees..." />
          <button ref="exportChart">Export</button>
          <button ref="printChart">Print</button>
        </div>
      </div>

      <!-- Recursive employee card structure -->
      <div class="chart-content" if="chartView == hierarchy">
        <div class="employee-card" ref="employeeCard">
          <div ref="cardHeader" class="card">
            <img src="{photoUrl}" class="employee-photo" />
            <div class="employee-info">
              <h3 class="employee-name">{employeeName}</h3>
              <p class="employee-title">{title}</p>
              <p class="employee-dept">{department}</p>
            </div>
            <button ref="expandToggle" class="expand-btn" if="directReports.length > 0">
              {isExpanded ? '−' : '+'}
            </button>
          </div>
          <div class="direct-reports" if="isExpanded && directReports.length > 0">
            <div class="report-list">
              <div forEach="directReports" trackBy="employeeId">
                <recurse ref="employeeCard" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats footer -->
      <footer class="chart-footer">
        <span>Total Employees: {totalCount}</span>
        <span>Departments: {deptCount}</span>
        <span>Levels: {hierarchyDepth}</span>
      </footer>
    </div>
  </body>
</html>
```

### Example 4: Navigation Menu with Multi-level Submenus

A sidebar navigation with branding and user info, where menu items can have nested submenus.

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        appName: string
        userName: string
        userRole: string
        label: string
        id: string
        icon: string
        url: string
        isActive: boolean
        hasSubmenu: boolean
        isOpen: boolean
        submenu:
          items: array<$/data>
    </script>
  </head>
  <body>
    <nav class="sidebar">
      <!-- Sidebar header with branding -->
      <div class="sidebar-header">
        <img src="/logo.png" class="app-logo" />
        <h2>{appName}</h2>
      </div>

      <!-- Recursive menu structure -->
      <ul class="nav-menu">
        <li class="menu-item" ref="menuItem">
          <a ref="menuLink" href="{url}" class="menu-link {isActive ? 'active' : ''}">
            <span class="menu-icon">{icon}</span>
            <span class="menu-label">{label}</span>
            <span class="submenu-arrow" if="hasSubmenu"> {isOpen ? '▼' : '▶'} </span>
          </a>
          <ul class="submenu" if="hasSubmenu && isOpen">
            <li forEach="submenu.items" trackBy="id">
              <recurse ref="menuItem" />
            </li>
          </ul>
        </li>
      </ul>

      <!-- User profile section at bottom -->
      <div class="sidebar-footer">
        <div class="user-profile">
          <img src="{userAvatar}" class="user-avatar" />
          <div class="user-info">
            <span class="user-name">{userName}</span>
            <span class="user-role">{userRole}</span>
          </div>
          <button ref="userMenu">⋮</button>
        </div>
        <button ref="logout" class="logout-button">Logout</button>
      </div>
    </nav>
  </body>
</html>
```

**Key points:**

- Branding header and user profile footer are not recursive
- Only the menu item `<li>` structure repeats for nested submenus
- The recursion goes through an indirect path: `submenu.items: array<$/data>`

## Migration Path

### For Existing Components Using Self-Import

Components currently using the self-import pattern can be migrated to use recursive regions:

**Before (separate component file):**

`tree-node.jay-html`:

```html
<html>
  <head>
    <script type="application/jay-headfull" src="./tree-node" names="TreeNode, Node"></script>
    <script type="application/jay-data">
      data:
        headChar: string
        node: Node
        open: boolean
    </script>
  </head>
  <body>
    <div>
      <div ref="head">
        <span class="tree-arrow">{headChar}</span>
        <span>{node.name}</span>
      </div>
      <ul if="open">
        <li forEach="node.children" trackBy="id">
          <TreeNode props="{.}" />
        </li>
      </ul>
    </div>
  </body>
</html>
```

**After (single file with recursive region):**

`tree.jay-html`:

```html
<html>
  <head>
    <script type="application/jay-data">
      data:
        title: string
        name: string
        id: string
        open: boolean
        children: array<$/data>
    </script>
  </head>
  <body>
    <div class="tree-view">
      <h1>{title}</h1>

      <div class="tree-node" ref="treeNode">
        <div ref="head">
          <span class="tree-arrow">{open ? '▼' : '►'}</span>
          <span>{name}</span>
        </div>
        <ul if="open">
          <li forEach="children" trackBy="id">
            <recurse ref="treeNode" />
          </li>
        </ul>
      </div>
    </div>
  </body>
</html>
```

**Benefits of migration:**

- Eliminates the need for a separate component file
- All HTML structure stays in one place
- Easier to see the complete component structure
- Can add non-recursive sections (header, footer, etc.) easily

### Backward Compatibility

The self-import pattern should continue to work for components that genuinely need to be separate, allowing gradual migration. Recursive regions are recommended for cases where a single large HTML structure has one or more recursive sections.

## Q & A

1. **Type reference syntax**: Should we require explicit `array<$/data>` annotation or infer from usage?

   - **Answer**: Require explicit `array<$/data>` for clarity and to help design tools
   - Uses `$` prefix (inspired by JSON Schema `$ref`) to avoid YAML comment syntax (`#`)
   - This makes the recursive relationship explicit and unambiguous
   - Allows referencing any type in the structure, not just root (e.g., `array<$/data/path>`)

2. **Multiple recursion points**: Can a component have multiple recursive properties with different recursive regions?

   ```yaml
   data:
     leftTree: array<$/data>
     rightTree: array<$/data>
   ```

   - **Answer**: Yes, supported naturally by having multiple recursive regions (multiple `ref="name"` elements with corresponding `<recurse>` calls)

3. **Depth limiting**: Should there be runtime depth limiting to prevent infinite recursion bugs?

   - **Answer**: No, no need

4. **Performance**: How do we optimize recursive rendering for large trees?
   - Use virtual scrolling for large lists
   - Lazy loading of deep nodes
   - These are runtime optimizations, not compiler concerns

## Conclusion

Using regular `ref="name"` to mark regions and `<recurse ref="name" />` to trigger recursion provides the cleanest, most intuitive syntax for recursive jay-html structures. Combined with `$`-prefixed type references (`array<$/data>`, inspired by JSON Schema `$ref`), this creates a clear and explicit system for defining recursive UIs. The compiler automatically detects which refs mark recursive regions based on `<recurse>` usage. It maintains type safety, works well with design tools, and reduces boilerplate compared to the current self-import approach.

Key benefits:

- **Reuses Jay's ref system**: Uses familiar `ref` attributes with no special syntax
- **Automatic detection**: Compiler infers recursive regions from `<recurse>` usage
- **Explicit**: Recursion points are clearly marked with `<recurse ref="name" />`
- **Clear type references**: Uses `array<$/data>` notation (inspired by JSON Schema `$ref`)
- **Flexible type references**: Can reference root type or nested types (`array<$/data/path>`)
- **Safe**: Compiler enforces recursion guards
- **Type-safe**: Generates correct recursive TypeScript types
- **Design-tool friendly**: Easy to understand and generate
- **Flexible**: Supports direct and indirect recursion, multiple recursive regions
- **Focused on HTML subtrees**: Allows large HTML structures with specific recursive sections

This design enables developers and designers to build complex recursive UIs like trees, nested comments, and file browsers with minimal effort while maintaining Jay's core principles of type safety and design-code integration.

---

## Design Refinement: Self-Guarding Recursion (October 2025)

### Key Realization

During implementation and testing, we discovered that **recursion with an accessor attribute is inherently self-guarding** and does not require an explicit `forEach` or `if` conditional wrapper.

### Why Accessor-Based Recursion Is Self-Guarding

The `withData` runtime function (which handles accessor-based recursion) includes built-in null checking and conditional mounting/unmounting:

```typescript
function mkUpdateWithData<ParentViewState, ChildViewState>(
  child: WithData<ParentViewState, ChildViewState>,
  group: KindergartenGroup,
): [updateFunc<ParentViewState>, MountFunc, MountFunc] {
  // ...
  const update = (newData: ParentViewState) => {
    const childData = child.accessor(newData);
    const result = childData != null; // <-- Built-in null check

    // Only constructs/renders when childData is not null
    if (!childElement && result) {
      // Construct child element in child's context
      const childContext = parentContext.forAsync(childData);
      childElement = restoreContext(savedContext, () =>
        withContext(CONSTRUCTION_CONTEXT_MARKER, childContext, () => child.elem()),
      );
    }

    // Handles mounting/unmounting based on null check
    if (result) {
      // Mount and update with child data
      childElement!.update(childData!);
    } else if (lastResult) {
      // Unmount when child becomes null
      childElement!.unmount();
    }
  };
}
```

This means:

- If `accessor` returns `null`, the recursive element is never constructed
- Recursion naturally terminates when reaching a leaf node (where `left`/`right`/`next` is `null`)
- No explicit `if` conditional needed around `<recurse accessor="left">`

### Updated Validation Rules

**Old Rule (Initial Design):**

- All `<recurse>` elements must be inside a `forEach` loop or `if` conditional

**New Rule (Refined):**

- `<recurse>` **with accessor** (e.g., `<recurse ref="node" accessor="left">`) is self-guarding via `withData`'s null check
  - No explicit guard required
  - Can be used directly inside the recursive region
- `<recurse>` **without accessor** or with `accessor="."` must be inside a `forEach` loop
  - Relies on `forEach` to provide the iteration context
  - `forEach` itself provides the guard (no iteration when array is empty)

### Examples

#### Self-Guarding: Binary Tree with Accessor

```html
<div ref="treeNode">
  <div class="value">{value}</div>
  <div class="children">
    <!-- No explicit 'if' needed - withData checks hasLeft/left for null -->
    <div class="left-child" if="hasLeft">
      <recurse ref="treeNode" accessor="left" />
    </div>
    <div class="right-child" if="hasRight">
      <recurse ref="treeNode" accessor="right" />
    </div>
  </div>
</div>
```

The `if="hasLeft"` is optional for recursion safety (withData handles null), but useful for UX (avoiding empty divs).

#### Requires Guard: Tree with forEach

```html
<div ref="treeNode">
  <div class="name">{name}</div>
  <!-- forEach is required - provides both context and guard -->
  <ul if="open">
    <li forEach="children" trackBy="id">
      <recurse ref="treeNode" />
      <!-- or accessor="." -->
    </li>
  </ul>
</div>
```

The `forEach` is required because:

1. It provides the iteration context (switches to each child's data)
2. It guards against infinite recursion (no iteration when `children` is empty)

### Implementation Impact

The compiler validation was updated to reflect this:

```typescript
// Recursion with accessor uses withData which has built-in null check (self-guarding)
// Recursion without accessor (or with ".") relies on forEach context, so needs explicit guard
if ((!accessorAttr || accessorAttr === '.') && !context.isInsideGuard) {
  return new RenderFragment('', Imports.none(), [
    `<recurse ref="${refAttr}"> without accessor must be inside a forEach loop to provide context and prevent infinite recursion`,
  ]);
}
```

### Design Implications

This refinement:

1. **Simplifies usage** for common recursive structures (linked lists, binary trees)
2. **Reduces boilerplate** - no need for redundant conditionals around accessor-based recursion
3. **Maintains safety** - recursion still cannot cause infinite loops
4. **Clarifies semantics** - accessor-based and forEach-based recursion have different requirements
5. **Preserves flexibility** - developers can still add `if` conditions for UX purposes

The distinction between "self-guarding accessor recursion" and "forEach-guarded iteration recursion" better reflects the underlying runtime behavior and makes the feature easier to understand and use correctly.
