# Jay Runtime

The Jay Runtime library is an efficient dom manipulation library, built to be the output of code generation (`jay-compiler`).
See the `jay-compiler` docs for the format of the `jay-html` file that compiles to `jay-runtime` types.

# Usage

For example, a simple a jay-html is

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

which is then compiled into

```typescript
import {
  JayElement,
  RenderElement,
  HTMLElementProxy,
  RenderElementOptions,
} from '@jay-framework/runtime';

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

A Jay element can be used directly (without a Jay Component) as the below example.

```typescript
import { render } from 'counter.jay-html';

const [refs, render2] = render();
const jayElement: CounterElement = render2({ count: 12 });
```

> However, in most cases, the generated `JayElement` is used by a jay component, and there is no need to use Jay Element members directly

The members above in the jay element creation sequence:

- `render`: the generated function from the `jay-html` file.
- `refs`: an object holding the references for DOM elements or child components.
  In the example above, it has two members - `subtracter` and `adderButton`.
  Read more about `refs` in [refs.md](./docs/refs.md)
- `render2`: a function, that given the element view state will create the actual element, including the DOM, `update`, `mount` and `unmount` functions
  as well as wire the DOM into the `refs`.
- `jayElement: CounterElement = JayElement<CounterViewState, CounterElementRefs>`: the created Jay element

The `JayElement<ViewState, refs>` is defined as

```typescript
interface BaseJayElement<ViewState> {
  dom: HTMLElement;
  update: updateFunc<ViewState>;
  mount: mountFunc;
  unmount: mountFunc;
}

interface JayElement<ViewState, Refs> extends BaseJayElement<ViewState> {
  refs: Refs;
}
```

### Properties:

- `dom`: An HTMLElement instance representing the DOM element associated with this JayElement.
  This is the element that will be rendered to the page, and can be added as a child to any other DOM element.
- `update`: A function of type `type updateFunc<ViewState> = (newData: ViewState) => void`.
  This function is responsible for updating the internal state (ViewState) of the JayElement and re-rendering its
  DOM representation if necessary. The ViewState is considered an **immutable** object by the internals of the `update` function.
- `mount`: A function of type `type mountFunc = () => void`. This function is used to mount a previously unmounted `JayElement`.
  `JayElement`s are created in mount state.
- `unmount`: A function of type `type mountFunc = () => void`. This function is designed to be called when the JayElement is removed from the DOM.
- `refs`: This property holds references by `ref` to DOM elements or other components within the JayElement.
  These references can be used to set event listeners, interact with child elements or component APIs.
  Read more about `refs` in [refs.md](./docs/refs.md).

## implementation details

- See the [Generated JayElement](./docs/jay-element.md) for the details of the `jay-html` generated target.
- See the [Generated JayElement creation Functions](./docs/runtime.md) for the details of the jay element creation functions used by the `jay-html` generated target.
- See the [Context Implementation](./docs/context.md) for the details of the context API internals (not the public API).
- See the [Kindergarten](./docs/kindergarten.md) for the class responsible to manage the children of a DOM element.
