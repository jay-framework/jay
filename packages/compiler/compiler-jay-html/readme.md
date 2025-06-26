# Jay-HTML Format & Compiler

Jay-HTML extends standard HTML with minimal additions to support component-based development. It provides a declarative way to define component interfaces and data contracts.

## Basic Example

Here's a simple Jay-HTML file:

```html
<html>
  <head>
    <script type="application/yaml-jay">
      data:
        count: number
    </script>
  </head>
  <body>
    <div>
      <button ref="subtracter">-</button>
      <span style="margin: 0 16px">{count}</span>
      <button ref="adder-button">+</button>
    </div>
  </body>
</html>
```

## Key Differences from Standard HTML

Jay-HTML extends HTML with seven main features:

1. **Component and type imports** - Import reusable components and type definitions
2. **Data contract definition** - Define component interfaces using YAML
3. **Component composition** - Use imported components as HTML elements
4. **Element references** - Create programmatic references to DOM elements
5. **Data binding** - Bind component data to HTML using `{}` syntax
6. **Conditional rendering** - Show/hide elements based on conditions
7. **List rendering** - Iterate over arrays with `forEach` and `trackBy`

## Component Import System

Jay-HTML provides a TypeScript-like import system adapted for HTML. You can import both headfull and headless components.

### Importing Headfull Components

Headfull components include both the contract and UI design:

```html
<script
  type="application/jay-headfull"
  src="{path}"
  names="{names to import}"
  sandbox="{boolean}"
></script>
```

**Parameters:**
- `path` - Relative or absolute path to the component file
- `names` - Comma-separated list of exported members. Supports renaming with `name as alias` syntax
- `sandbox` - (Optional, defaults to false) Enable sandboxed component execution

### Importing Headless Components

Headless components provide only the contract and logic:

```html
<script
  type="application/jay-headless"
  contract="{contract-path}"
  src="{component-path}"
  name="{component-name}"
  key="{nested-key}"
></script>
```

**Parameters:**
- `contract` - Path to the contract file (`.jay-contract`)
- `src` - Path to the component implementation
- `name` - Name of the exported component definition
- `key` - Attribute name for nesting the component's ViewState and Refs

### Import Examples

```html
<!-- Import a headfull component -->
<script
  type="application/jay-headfull"
  src="./counter.ts"
  names="Counter"
  sandbox="false"
></script>

<!-- Import multiple components with aliases -->
<script
  type="application/jay-headfull"
  src="./ui-components.ts"
  names="Button as PrimaryButton, Card as ProductCard"
  sandbox="true"
></script>

<!-- Import a headless component -->
<script
  type="application/jay-headless"
  contract="../data-store/store.jay-contract"
  src="../data-store/store"
  name="dataStore"
  key="store"
></script>
```

## Jay-HTML Documentation

Read the complete Jay-HTML documentation including data contracts, syntax, components, and directives in [jay-html-docs.md](docs/jay-html-docs.md). 