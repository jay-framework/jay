# Jay 4 React

The Jay 4 React runtime module is an adapter module that enables running Jay Components "as is" with React Code.

* A Jay Component runs "as is"
* A Jay Element is compiled into regular functional React component
* The `jay2React` and `mimicJayElement` adapt between Jay and React

The main principle is that the Jay development experience is not changed, while the only thing that changes is now 
we compile the `jay-html` files into Jay Elements. This runtime library facilitates this process.

Using those function require compiling Jay with compilation target React. 
See the [compiler](../../compiler/compiler) for more details on compile target.

## jay2React

The function `Jay2React` is an adapter function turning a Jay Component into a React component. 
It is used in React code seeking to import Jay Components, as well as in generated Jay Elements
who have child Jay Components.

```typescript
const ReactCart = jay2React(() => Cart);
```

Where `Cart` is a regular Jay Component, and `ReactCart` is a React component.

The function transforms Jay the Jay Component as
* Jay Props become React Props
* Jay Events become callbacks in React Props
* Jay APIs are not exposed in React (as React has no notion of component APIs)

## mimicJayElement

The function `mimicJayElement` is an adapter function turning a React Component into a Jay Element, 
to be used with React Components.