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

## importing components and types

import in jay-html is very similar to typescript import, adapted for an html format.
Normally, we only import components and data types from a jay-html file.

```html
<script type="application/jay-headfull" src="{path}" names="{names to import}" sandbox="{boolean}"></script>
```

- `path` - a relative or absolute path to the file from which to import
- `names to import` - list of exported members to import. Names can be renamed using the `name as anotherName` syntax.
  multiple names can be imported separated by a comma `name1, name2, name3`.
- `sandbox` - (defaults to false) should the file be imported as a sandboxed component.

examples:

```html
<script type="application/jay-headfull" src="./component1.ts" names="comp1" sandbox="false"></script>
<script type="application/jay-headfull" src="./component2.ts" names="comp2 as Main, Comp2Props" sandbox="true"></script>
```

## The `application/yaml-jay` Data Contract

The data contract defines the `ViewState` - the input data for the element.
The ViewState is defined as a `YAML` script, which root is `data:`.
Each property of the yaml is a property of the element view state, including nested objects and arrays.

The supported data types:

| type          | example                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| string        | `text: string`                                                          |
| number        | `n1: number`                                                            |
| boolean       | `b1: boolean`                                                           |
| object        | <code>o1: </br>&nbsp;&nbsp;s2: string</br>&nbsp;&nbsp;n2: number</code> |
| array         | <code>a1: </br>-&nbsp;s3: string</br>&nbsp;&nbsp;n3: number</code>      |
| enum          | `an_enum: enum(one \| two \| three)`                                    |
| imported type | `name: imported-type-name`                                              |
| -----------   | ----------------                                                        |

> note: The jay html file considers the view state as the **current view state** to be bound  
> into components and elements.
>
> The `forEach` directive changes the **current view state** from an object to the items of
> a child array.
>
> e.g.
>
> ```yaml
> data:
>   a1:
>     - b1: string
>     - key: string
> ```
>
> ```html
> <!-- here the current view state is a1 -->
> <div forEach="a1" trackBy="kay">
>   <!-- here the current view state is elements of the array a1 -->
> </div>
> ```

## Sub components

Jay html files allows to use sub-components as part of the html tree.

To use a sub-component, it has to first be imported as a link tag

```html
<script type="application/jay-headfull" src="./component1.ts" names="comp1" sandbox="false"></script>
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

## references - `ref` attribute

References are declaration of elements or sub-components that the component code can reference.

For each html element or component with a `ref` attribute, a member is created in the Jay element refs type to represent how
that html element or component can be interacted with.

examples:

```html
<div ref="ref1">{text}</div>
<Counter ref="counter1" initialValue="{count1}" />
```

The `jay-runtime` library defines the reference types - see [refs.md](../../../runtime/runtime/docs/refs.md).

## the `{}` binding

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

### class bindings

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

## special directives `if`

The `if` directive is an attribute which can appear on any HTML element or sub-component.
It indicates conditional rendering based on the given expression.

```html
<div if="open">
  <div>an open item</div>
</div>
```

In the above example, the `an open item` div will be rendered if `open` is true.

> Note: it is not needed to add `{}` binding as it is clear the `if` accepts an expression.

## special directives `forEach` and `trackBy`

The `forEach` and `trackBy`directives are attributes which can appear on any HTML element or sub-component.
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
