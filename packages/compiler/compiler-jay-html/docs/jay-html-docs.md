# Jay-HTML Syntax Reference

Jay-HTML extends standard HTML with several features for component-based development. This document covers the syntax elements that distinguish Jay-HTML from regular HTML.

A Jay-HTML file must contain one `application/jay-data` script and can include several unique Jay directives.

## Data Contract Definition

The data contract defines the `ViewState` - the input data structure for the component.
The ViewState is defined as a YAML script with `data:` as the root element.
Each property in the YAML becomes a property of the component's view state, supporting nested objects and arrays.

### Supported Data Types

| Type            | Example                                                                      | Description                          |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| `string`        | `text: string`                                                               | Text values                          |
| `number`        | `count: number`                                                              | Numeric values                       |
| `boolean`       | `isVisible: boolean`                                                         | True/false values                    |
| `object`        | <code>user: </br>&nbsp;&nbsp;name: string</br>&nbsp;&nbsp;age: number</code> | Nested object structures             |
| `array`         | <code>items: </br>-&nbsp;name: string</br>&nbsp;&nbsp;value: number</code>   | Collections of items                 |
| `enum`          | `status: enum(active \| inactive \| pending)`                                | Enumerated values                    |
| `imported type` | `config: ImportedConfig`                                                     | Types imported from other components |

### View State Context

Jay-HTML treats the view state as the **current context** that gets bound to components and elements. The `forEach` directive changes this context from an object to individual array items.

#### Example: Context Switching with forEach

```yaml
data:
  users:
    - id: string
    - name: string
    - email: string
```

```html
<!-- Current context: users array -->
<div forEach="users" trackBy="id">
  <!-- Current context: individual user object -->
  <span>{name}</span>
  <span>{email}</span>
</div>
```

In this example, the context switches from the `users` array to individual `user` objects within the forEach loop.

## Component Usage

Jay-HTML allows you to use components as part of the HTML structure. Components must be imported before they can be used.

### Importing Components

```html
<script
  type="application/jay-headfull"
  src="./my-component.ts"
  names="MyComponent"
  sandbox="false"
></script>
```

### Using Components

```html
<MyComponent title="Welcome" count="{itemCount}"></MyComponent>
```

### Property Binding Options

Components accept properties in three ways:

1. **Static values**: `title="Welcome"`
2. **View state bindings**: `count="{itemCount}"` - binds to a specific property
3. **Context binding**: `data="{.}"` - binds the entire current context

> **Note**: Jay currently doesn't support passing children as properties to components. This feature is planned for future releases.

## Element References

The `ref` attribute creates references to HTML elements or components that your component code can interact with.

### Creating References

```html
<div ref="mainContainer">{content}</div>
<Counter ref="counterComponent" initialValue="{startCount}" />
```

For each element with a `ref` attribute, Jay generates a corresponding member in the component's refs type, enabling programmatic interaction.

Reference types are defined in the `@jay-framework/runtime` library - see [refs.md](../../../runtime/runtime/docs/refs.md) for details.

## Data Binding

The `{}` syntax enables dynamic data binding to the current view state context. This syntax supports property access, conditional expressions, and simple operations.

### Basic Binding

```html
<div>{title}</div>
<div>Hello, {user.name}!</div>
<div>Count: {items.length}</div>
```

### Conditional Expressions

```html
<div>{isVisible ? 'Visible' : 'Hidden'}</div>
<div>{hasName ? name : 'Anonymous'}</div>
<div>{!isLoading ? 'Ready' : 'Loading...'}</div>
```

### Enum Comparisons

```html
<div>{status === 'active' ? 'Online' : 'Offline'}</div>
<div>{role !== 'admin' ? 'User' : 'Administrator'}</div>
```

### Class Binding

Class bindings support dynamic and conditional class inclusion:

#### Dynamic Class from Property

```html
<div class="{status}">Status indicator</div>
```

#### Conditional Class (Short Form)

Use the `{condition ? class-name}` syntax to conditionally add a class. The class name is **not quoted**:

```html
<div class="indicator {isActive ? active} {isLoading ? loading}">Status</div>
```

When the condition is true, the class is added. When false, it's omitted.

#### Conditional Class (Full Ternary)

Use the full ternary syntax `{condition ? class-a : class-b}` to switch between two classes:

```html
<div class="{isPrimary ? primary : secondary} button">Button</div>
```

#### Combining Static and Conditional Classes

```html
<a
  href="/cart"
  class="cart-indicator {hasItems ? has-items} {isLoading ? is-loading} {justAdded ? just-added}"
>
  <span class="icon">🛒</span>
  <span class="count" if="hasItems">{itemCount}</span>
</a>
```

## Conditional Rendering

The `if` directive conditionally renders elements based on expressions.

### Basic Conditional Rendering

```html
<div if="isVisible">
  <p>This content is only shown when isVisible is true</p>
</div>
```

> **Note**: The `if` directive automatically evaluates expressions, so `{}` binding syntax is not needed.

## List Rendering

The `forEach` and `trackBy` directives enable rendering lists of items.

### Basic List Rendering

```html
<ul>
  <li forEach="users" trackBy="id">
    <span>{name}</span>
    <span>{email}</span>
  </li>
</ul>
```

### How It Works

- `forEach="users"` - iterates over the `users` array
- `trackBy="id"` - uses the `id` property to track items for efficient DOM updates
- Within the loop, the context becomes individual array items

Since Jay uses immutable view state, the `trackBy` attribute is essential for proper item tracking and DOM optimization.

### Example with Component

```html
<div forEach="products" trackBy="sku">
  <ProductCard product="{.}" />
</div>
```

In this example, each `ProductCard` component receives the entire product object as its context.

## Recursive Rendering

Jay-HTML supports recursive component structures where elements can reference themselves, enabling the rendering of tree-like and nested data structures.

### Defining Recursive Types

Recursive types are defined in the data contract using the `$/data` or `$/data/path` syntax:

```yaml
data:
  title: string
  tree:
    id: string
    name: string
    children: $/data/tree
```

The `$/data/tree` reference creates a recursive type where `children` has the same type as `tree` itself.

### Nested Recursive References

You can reference nested types deeper in the data structure:

```yaml
data:
  root:
    value: number
    nested:
      id: string
      children: $/data/root/nested
```

This creates a recursive type at `root.nested` where `children` has the same type as the parent `nested` object.

### Array Recursion vs. Array Item References

When working with arrays, you can use two different syntaxes:

**Array Recursion** - Use `array<$/data/path>` to create arrays of recursive items:

```yaml
data:
  name: string
  id: string
  children: array<$/data>
```

This creates an array where each item has the same type as the root data structure.

**Generated TypeScript:**

```typescript
export interface TreeViewState {
  name: string;
  id: string;
  children: Array<TreeViewState>;
}
```

**Array Item Unwrapping** - Use `$/data/path[]` to reference a single item from an array property:

```yaml
data:
  products:
    - id: string
      name: string
      price: number
  featuredProduct: $/data/products[]
```

The `[]` suffix unwraps the array and links to the item type instead of the full array.

**Generated TypeScript:**

```typescript
export interface ProductOfProductListViewState {
  id: string;
  name: string;
  price: number;
}

export interface ProductListViewState {
  products: Array<ProductOfProductListViewState>;
  featuredProduct: ProductOfProductListViewState | null;
}
```

**Comparison:**

| Syntax               | Use Case                  | Generated Type     |
| -------------------- | ------------------------- | ------------------ |
| `array<$/data>`      | Multiple items (array)    | `Array<ItemType>`  |
| `$/data/arrayProp`   | Reference to entire array | `Array<ItemType>`  |
| `$/data/arrayProp[]` | Single item from array    | `ItemType \| null` |

### Creating Recursive Regions

Use the `ref` attribute to mark an element as a recursive region, then use `<recurse>` to trigger recursion:

```html
<div class="tree-node" ref="treeNode">
  <div class="node-name">{name}</div>
  <div if="children">
    <recurse ref="treeNode" accessor="children" />
  </div>
</div>
```

The compiler generates a recursive function for the referenced element, and `<recurse>` calls that function with the specified data.

### Context Switching with `<with-data>`

When your recursive data is nested within a parent structure, use `<with-data>` to switch the view state context:

```yaml
data:
  title: string
  description: string
  btree:
    value: number
    left: $/data/btree
    right: $/data/btree
```

```html
<div class="tree-container">
  <h1>{title}</h1>
  <p>{description}</p>
  <with-data accessor="btree">
    <div class="tree-node" ref="treeNode">
      <div>{value}</div>
      <div if="left">
        <recurse ref="treeNode" accessor="left" />
      </div>
      <div if="right">
        <recurse ref="treeNode" accessor="right" />
      </div>
    </div>
  </with-data>
</div>
```

The `<with-data>` element:

- Accepts an `accessor` attribute specifying a property path
- Changes the view state context for its children
- Must have exactly one child element
- Works with both object and array types

This allows the recursive region to operate on a consistent type (`btree`) whether it's at the root level or in a recursive call.

### Identity Accessor with `forEach`

Within a `<with-data>` context, you can use `forEach="."` to iterate over the current context:

```html
<with-data accessor="tree">
  <ul ref="menuItem">
    <li forEach="." trackBy="id">
      <span>{name}</span>
      <div if="children">
        <recurse ref="menuItem" accessor="children" />
      </div>
    </li>
  </ul>
</with-data>
```

The `forEach="."` syntax means "iterate over the current context", which is useful when `<with-data>` has already narrowed the context to an array.

### Recursion Guards

Recursion requires proper guards to prevent infinite loops:

- **Recursion with accessor** (e.g., `<recurse accessor="children"/>`) uses `withData` which includes a built-in null check
- **Recursion without accessor** (e.g., `<recurse/>` in a forEach loop) must be inside a `forEach` or conditional to prevent infinite recursion

Example with forEach (no accessor needed):

```html
<ul ref="list">
  <li forEach="items" trackBy="id">
    {text}
    <recurse ref="list" />
  </li>
</ul>
```

Example with accessor (built-in guard):

```html
<div ref="node">
  {value}
  <recurse ref="node" accessor="child" />
</div>
```
