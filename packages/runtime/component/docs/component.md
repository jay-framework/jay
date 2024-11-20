# Creating Jay Components

Jay Component is defined in the `jay-runtime` library as anything that implements the interface

```typescript
interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>> {
  element: jayElement;
  update: updateFunc<Props>;
  mount: MountFunc;
  unmount: MountFunc;
  addEventListener: (type: string, handler: JayEventHandler<any, ViewState, void>) => void;
  removeEventListener: (type: string, handler: JayEventHandler<any, ViewState, void>) => void;
}
```

the `jay-component` library defines a reactive and elegant way to create headless Jay-Components.

## Simple Example

```typescript
import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from 'jay-component';

export interface CounterProps {
  initialValue: number;
}

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
  const [count, setCount] = createSignal(initialValue);

  refs.subtracter.onclick(() => setCount(count() - 1));
  refs.adderButton.onclick(() => setCount(count() + 1));

  return {
    render: () => ({ count }),
  };
}

export const Counter = makeJayComponent(render, CounterConstructor);
```

The full example can be found at [counter.ts](../../../../examples/jay/counter/src/counter.ts)

## The Component Constructor

The `jay-component` library offers constructing jay components using a component constructor function of the form

```typescript
interface JayComponentCore<PropsT, ViewState> {
  render: (props: Props<PropsT>) => ViewStateGetters<ViewState>;
}

type ComponentConstructor<
  PropsT extends object,
  Refs extends object,
  ViewState extends object,
  Contexts extends Array<any>,
  CompCore extends JayComponentCore<PropsT, ViewState>,
> = (props: Props<PropsT>, refs: Refs, ...contexts: Contexts) => CompCore;
```

### Parameters:

- `props: Props<PropsT>`: an object holding signals for each of the component properties.
  The `Props<T>` generic type turns an object of values into an object of signal getters.
- `refs: Refs`: the refs type from the associated Jay Element of the components
- `...contexts: Contexts`: The context instances requested by the `makeJayComponent` function

### Returns

The function has to return an object implementing `JayComponentCore` which has to have a render function.
In addition, the returned object may have exported API functions and exported events of the component.

#### returned object render function

The returned `JayComponentCore` has to have a render function that returns `ViewStateGetters<ViewState>`.
The `ViewState` is the view state of the jay-element the component is using, and the `ViewStateGetters` allows
to provide the view state as values or getter functions.

both of the below are valid usages of render:

```typescript
// as a signal
const [count, setCount] = createSignal(initialValue);
return {
  render: () => ({ count }),
};

// as a value
return {
  render: () => ({ count: count() }),
};
```

The render function itself is reactive, allowing to perform calculations as part of the render function.

```typescript
// using a computation
const [count, setCount] = createSignal(initialValue);
return {
  render: () => ({ count, description: `the count is ${count()}` }),
};
```

## The `makeJayComponent` function

The `makeJayComponent` function returns a function that when called with `props`, will create a component instance.

```typescript
declare function makeJayComponent<
  PropsT extends object,
  ViewState extends object,
  Refs extends object,
  JayElementT extends JayElement<ViewState, Refs>,
  Contexts extends Array<any>,
  CompCore extends JayComponentCore<PropsT, ViewState>,
>(
  preRender: PreRenderElement<ViewState, Refs, JayElementT>,
  comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>,
  ...contextMarkers: ContextMarkers<Contexts>
): (props: PropsT) => ConcreteJayComponent<PropsT, ViewState, Refs, CompCore, JayElementT>;
```

### Parameters:

- `preRender: PreRenderElement<ViewState, Refs, JayElementT>`: The render function from a `JayElement` constructor.
- `comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>`: the component constructor function.
- `...contextMarkers: ContextMarkers<Contexts>`: zero or more context markers created using `createJayContext`.
  read more about providing contexts in [provide-context.md](./provide-context.md) and [provide-reactive-context.md](./provide-reactive-context.md).

### Returns

A function that when called with props creates a component instance.

#### returned function parameters:

- `props: PropsT`: an object holding the properties for the component.
