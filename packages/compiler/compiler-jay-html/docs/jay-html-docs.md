# Jay-HTML Syntax

Jay-HTML extends standard HTML with several features for component-based development. This document covers the syntax elements that make Jay-HTML different from regular HTML.

## Sub Components

Jay html files allows to use sub-components as part of the html tree.

To use a sub-component, it has to first be imported as a link tag

```html
<script
  type="application/jay-headfull"
  src="./component1.ts"
  names="comp1"
  sandbox="false"
></script>
```

and then used as any other HTML element

```html
<comp1 prop1="value1" prop2="{value2}"></comp1>
```

Component properties can be supplied as

1. static values - `prop1="value1"`
2. bindings to the current view state named property - `prop2="{value2}"`
3. bindings to the current view state itself - `prop3: "{.}"`

> note: currently Jay does not support sub-component children as a children property or similar
> This is a pending issue to support.

## References - `ref` attribute

References are declaration of elements or sub-components that the component code can reference.

For each html element or component with a `ref` attribute, a member is created in the Jay element refs type to represent how
that html element or component can be interacted with.

examples:

```html
<div ref="ref1">{text}</div>
<Counter ref="counter1" initialValue="{count1}" />
```

The `jay-runtime` library defines the reference types - see [refs.md](../../../runtime/runtime/docs/refs.md).

## The `{}` binding

The `{}` binding to the current view state allows to render values into HTML text, attributes, styles or component properties.

The `{}` syntax supports the `.` notation to access sub-elements, embedding within strings and simple expressions.

examples:

```html
<div>{text}</div>
<div>this is the name: {name}</div>
<div>this is a sub property: {obj.member.sub}</div>
<div>conditional: {hasName?name}</div>
<!-- renders name if hasName is true, else empty string -->
<div>conditional: {hasName?name:otherProp}</div>
<!-- renders name if hasName is true, else otherProperty of view state -->
<div>not: {!hasName}</div>
<div>enum equals: {enumProperty === EnumMember}</div>
<div>enum not equals: {enumProperty !== EnumMember}</div>
```

### Class bindings

HTML Class bindings allows using expressions for dynamic and optional class inclusion

examples:

```html
<div class="{viewStateProp}"></div>
<!-- will add a class name per the value of the viewStateProp -->
<div class="{isOne? class1} tree"></div>
<!-- will include class1 if isOne is true -->
<div class="{isOne? class1:class2} tree"></div>
<!-- will include class1 if isOne is true, else class2 -->
```

## Special Directives

### `if` directive

The `if` directive is an attribute which can appear on any HTML element or sub-component.
It indicates conditional rendering based on the given expression.

```html
<div if="open">
  <div>an open item</div>
</div>
```

In the above example, the `an open item` div will be rendered if `open` is true.

> Note: it is not needed to add `{}` binding as it is clear the `if` accepts an expression.

### `forEach` and `trackBy` directives

The `forEach` and `trackBy` directives are attributes which can appear on any HTML element or sub-component.
It indicates repeated rendering based on the given expressions.

The `forEach` takes an expression that resolves to an array of items.
Once resolved, the rendered item view state are the items of the array.

The `trackBy` is an attribute of type `string` of the array items, the forEach item view state, used as a key
for tracking items to DOM elements (note that in Jay, view state is immutable, requiring a key to track by instances).

```html
<li forEach="node.children" trackBy="id">
  <TreeNode props="{.}" />
</li>
```

in the above example, the `TreeNode` will render for each item in the `node.children` array, tracked by the item `id` property. 