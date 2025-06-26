# Jay File Format & Parsing

The Jay format is based on standard HTML with minimal additions.

An example Jay HTML file is

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

The Jay HTML file differs from a regular HTML file with 5 aspects:

1. Import component and types
2. The `application/yaml-jay` for data contract definition
3. Sub-components
4. The `ref`s attribute
5. The `{}` binding
6. Special directive `if`
7. Special directive `forEach` and `trackBy`

## Importing Components and Types

Import in jay-html is very similar to typescript import, adapted for an html format.
Normally, we only import components and data types from a jay-html file.

### Importing Headfull Components

```html
<script
  type="application/jay-headfull"
  src="{path}"
  names="{names to import}"
  sandbox="{boolean}"
></script>
```

- `path` - a relative or absolute path to the file from which to import
- `names to import` - list of exported members to import. Names can be renamed using the `name as anotherName` syntax.
  multiple names can be imported separated by a comma `name1, name2, name3`.
- `sandbox` - (defaults to false) should the file be imported as a sandboxed component.

### Importing Headless Components

```html
<script
  type="application/jay-headless"
  contract="{contract-path}"
  src="{component-path}"
  name="{component-name}"
  key="{nested-key}"
></script>
```

- `contract` - the location of the contract file (`.jay-contract`) to import
- `src` - the location of the component implementation
- `name` - the name of the exported component definition
- `key` - the attribute name under which the component's Contract ViewState and Refs are nested

examples:

```html
<script
  type="application/jay-headfull"
  src="./component1.ts"
  names="comp1"
  sandbox="false"
></script>
<script
  type="application/jay-headfull"
  src="./component2.ts"
  names="comp2 as Main, Comp2Props"
  sandbox="true"
></script>
<script
  type="application/jay-headless"
  contract="../named-counter/named-counter.jay-contract"
  src="../named-counter/named-counter"
  name="namedCounter"
  key="namedCounter"
></script>
```

## The `application/yaml-jay` Data Contract

Read more about the data contract format in [data-contract.md](docs/data-contract.md).

## Jay-HTML Syntax

Read more about Jay-HTML syntax including sub-components, references, bindings, and directives in [jay-html-syntax.md](docs/jay-html-syntax.md). 