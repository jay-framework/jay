# Jay 4 React

Jay 4 React is intended to provide a bridge between Jay and the existing React ecosystem. The core principle is to
continue and support Jay unique advantages (design 2 code and secure 3rd party components) while enabling to
work as part of a larger React application.

This leads to the following principles:

1. Write the components in Jay.
2. Use Jay component from React using the adapter function `jay2React`
3. Jay compiler to generate regular React components.
4. Anything that goes into the sandbox is running regular Jay.

**The end result is that a Jay component can be used as a React component,
and can use React components as child components.**

## jay2React

The `jay2React` function accepts a Jay Component and returns a React Component.

```typescript
const ReactCart = jay2React(Cart);
```

At which

- `Cart` is the Jay Component
- `ReactCart` is the React Component

In terms of signature it handles the types mapping including mapping Jay props to React props and
mapping Jay event handlers to React callback props.

In terms of implementation, it relays on the compiler to transform the Jay Component and Jay Element.
The React Component `makeJayComponent` is replaced with `makeJay2ReactComponent` making the Jay component into
a higher level react component, accepting the element as a react component.
The Jay Element is generated as a React Component.

## The generations / transformations

Jay 4 React adds a new generation target to Jay compiler - target = react, which includes

1. generating `jay-html` files as React components
2. transforming Jay components into higher level React components

## Example

Consider the counter component - sources in Jay -

### The Jay HTML file

Source

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

The generated React code for the element is

```typescript jsx
import { HTMLElementProxy } from 'jay-runtime';
import { Jay4ReactElementProps, eventsFor } from 'jay-4-react';
import { ReactElement } from 'react';

export interface CounterViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
    adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export interface CounterElementProps extends Jay4ReactElementProps<CounterViewState> {}

export function render({
    vs,
    context,
}: CounterElementProps): ReactElement<CounterElementProps, any> {
    return (
        <div>
            <button {...eventsFor(context, 'subtracter')}>-</button>
            <span style={{ margin: '0 16px' }}>{vs.count}</span>
            <button {...eventsFor(context, 'adderButton')}>+</button>
        </div>
    );
}
```

However, the `.d.ts` of the element remains the same as regular Jay to enable writing the component as with regular Jay.

```typescript
import { JayElement, RenderElement, HTMLElementProxy, RenderElementOptions } from 'jay-runtime';

export interface CounterViewState {
  count: number;
}

export interface CounterElementRefs {
  subtracter: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
  adderButton: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
}

export type CounterElement = JayElement<CounterViewState, CounterElementRefs>;
export type CounterElementRender = RenderElement<
  CounterViewState,
  CounterElementRefs,
  CounterElement
>;
export type CounterElementPreRender = [CounterElementRefs, CounterElementRender];

export declare function render(options?: RenderElementOptions): CounterElementPreRender;
```

## the component file

source

```typescript
import { CounterElementRefs, render } from './generated-react-element';
import { createEvent, createSignal, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
  initialValue: number;
}

function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
  let [count, setCount] = createSignal(initialValue);
  refs.adderButton.onclick(() => setCount(count() + 1));
  refs.subtracter.onclick(() => setCount(count() - 1));
  let onChange = createEvent<number>((emitter) => emitter.emit(count()));
  let reset = () => {
    setCount(0);
  };
  return {
    render: () => ({ count }),
    onChange,
    reset,
  };
}

export const Counter = makeJayComponent(render, CounterComponent);
```

Which is transformed into react component as

```typescript
import { CounterElementRefs, render } from './generated-react-element';
import { createEvent, createSignal, Props } from 'jay-component';
import { makeJay2ReactComponent } from 'jay-4-react';

export interface CounterProps {
  initialValue: number;
}

function CounterComponent({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
  let [count, setCount] = createSignal(initialValue);
  refs.adderButton.onclick(() => setCount(count() + 1));
  refs.subtracter.onclick(() => setCount(count() - 1));
  let onChange = createEvent<number>((emitter) => emitter.emit(count()));
  let reset = () => {
    setCount(0);
  };
  return {
    render: () => ({ count }),
    onChange,
    reset,
  };
}

export const Counter = makeJay2ReactComponent(render, CounterComponent);
```

# Update

The approach above requires transforming the component as well.
Can we create a method at which we do not transform the component, only generating the elements as React?

Yes, we can.

The jay-4-react package does just that.

The element is transformed into a React component, with an adapter function that mimics a Jay Element

A Counter, from above is generated now as

```typescript jsx
import * as React from 'react';
import { ReactElement } from 'react';
import { HTMLElementProxy } from 'jay-runtime';
import { Jay4ReactElementProps, mimicJayElement } from '../../../lib';
import { eventsFor } from '../../../lib';

export interface CounterElementViewState {
    count: number;
}

export interface CounterElementRefs {
    subtracter: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
    adder: HTMLElementProxy<CounterElementViewState, HTMLButtonElement>;
}

export interface CounterElementProps extends Jay4ReactElementProps<CounterElementViewState> {}

export function reactRender({
    vs,
    context,
}: CounterElementProps): ReactElement<CounterElementProps, any> {
    const { count } = vs;
    return (
        <div>
            <button role="sub" {...eventsFor(context, 'subtracter')}>
                -
            </button>
            <span role="value" style={{ margin: '0 16px' }}>
                {count}
            </span>
            <button role="add" {...eventsFor(context, 'adder')}>
                +
            </button>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
```

and `render` has the semantics of a Jay Element.

To use a Jay Component from an element or React Component, we use the `jay2React` adapter.
In the case of elements, it is generated into the element file who renders a sub-jay component. In the case of a React
component using Jay component, it has to be used explicitly.

The result is that we can now use Jay as React applications, including all the features of Jay

- Design to code
- Secure 3rd parties
- Jay programming model
