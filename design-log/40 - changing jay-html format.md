# Changing Jay HTML import format

First, why do we need to change the import format?
With the introduction of plugins, we have two different ways to import components - as a headfull component
and as a headless component.

- Headless component - includes a Contract file `YAML`, and a component `ts` file.
- Headfull component - includes a Design file `jay-html`, and a component `ts` file.

Before the change, the syntax for importing a headfull component is

```html
<link rel="import" href="./item" names="Item" />
```

and the syntax for importing a headless component (suggested in [39 - Plugin package.md](39%20-%20Plugin%20package.md)) is

```html
<script type="application/jay" src="stores/product-page" name="page" key="productPage" />
```

and we remind that `jay-html` also has the data script defined as

```html
<script type="application/jay-yaml">
  data:
</script>
```

## Suggested change

We want to transform all of the above into `script` tags with appropriate type

```html
<script
  type="application/jay-headless"
  src="stores/product-page"
  name="page"
  key="productPage"
></script>
<script type="application/jay-headfull" src="./item" names="Item"></script>
<script type="application/jay-data">
  data:
</script>
```

## final change

```html
<script type="application/jay-headless"
        contract="../named-counter/named-counter.jay-contract"
        src="../named-counter/named-counter"
        name="namedCounter"
        key="namedCounter"></script>
<script type="application/jay-headfull" src="./item" names="Item"></script>
<script type="application/jay-data">
  data:
</script>
```

The `application-jay-headless` import format includes
* `contract` - the location of the contract to import, which means importing the contract `ViewState` and `Refs` types. 
* `key` - the attribute name under which both the headless component `ViewState` and `Refs` are nested
   at the current component `ViewState` and `Refs`.
* `src` - the location of the implementation of the contract.
* `name` - the name of the `const` exported from the `src` module as the component definition.

Note: At this point we leave two deferred things to fix later -
1. By importing the `src` module, we can derive the `contract` automatically using typescript AST and explicit 
   definition of component usage of a contract file.
2. The `jay-html` compilation for jay is ignoring the `jay-headless` imports for now. 
   It is only used by `jay-stack` compilation of a page. Worth revisiting later for supporting 
   composite components as part of `jay` and not only `jay-stack`.