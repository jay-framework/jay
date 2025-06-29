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

Reference types are defined in the `jay-runtime` library - see [refs.md](../../../runtime/runtime/docs/refs.md) for details.

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

```html
<div class="{status}">Status indicator</div>
<div class="{isActive ? 'active' : 'inactive'}">Toggle state</div>
<div class="{isPrimary ? 'primary' : 'secondary'} button">Button</div>
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
