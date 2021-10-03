Jay Component
=====

This section tries to complete the APIs for the creation of a Jay Component. 
It is a direct continuation of [state management](./06%20-%20state%20management.md) 
and [nested components](./07%20-%20nested%20components.md).

The last component creation API from nested components doc was 

```typescript
import {render, ItemVS, ItemElement} from './item.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

export interface ItemData {
    text: string,
    dataId: string
}

export interface ItemComponent extends JayComponent<ItemData, ItemVS, ItemElement> {
    onremove: () => void
    doSomething(param1: string, param2: Date): string
}

export function Item(props: ItemData, je: ItemElement): ItemComponent {
    const [text, setText] = createState(props.text);
    const [done, setDone] = createState(false);
    const onremove = createEvent('remove');
    const doSomething = createAPI('doSomething', (param1: string, param2: Date) => {
        ///...
    })

    jayElement.done.onclick = () => setDone(!done());
    jayElement.remove.onclick = () => onremove();

    return () => ({
        text: text(),
        done: done(),
        dataId: props.dataId
    })
}

export default makeJayComponent(render, Item);
```

And with it, we notice that the component interface has still some issues -  
* The component API cannot be derived from the `Item` construction function, requireing the define
  a component API explicitly as `ItemComponent`
* The event and API function are not connected to the exported `ItemComponent` interface - 
  there is no type check between the definition and implementation.

                                                                   

## Creating a candidate Jay Component API

We expand the `Item` component constructor to return a component API definition such that 
`makeJayComponent` can use it to construct a component with type safety and type derivation.

The component now looks like

```typescript
import {render, ItemVS, ItemElement} from './item.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';
import {EventEmitter} from "./EventEmitter";

export interface ItemData {
    text: string,
    dataId: string
}

export function Item(props: ItemData, je: ItemElement) {
    const [text, setText] = createState(props.text);
    const [done, setDone] = createState(false);
    const onremove = new EventEmitter<void>();
    const doSomething = (param1: string, param2: Date): string => {
        ///...
    }

    jayElement.done.onclick = () => setDone(!done());
    jayElement.remove.onclick = () => onremove();

    const render = () => ({
        text: text(),
        done: done(),
        dataId: props.dataId
    })


    return {
        render,
        onremove,
        doSomething
    }
}

export default makeJayComponent(render, Item);
```
                     
And the derived component interface returned by `makeJayComponent(render, Item)` looks like

```typescript
//  effective derived interface returned from `makeJayComponent(render, Item)` 
interface ItemComponent extends JayComponent<ItemData, ItemVS, ItemElement> {
    onremove: () => void,
    doSomething: (param1: string, param2: Date) => string 
}
```

and used as a nested element as (assuming `jayElement` has a nested component `item`) 
```typescript
jayElement.item.onremove = () => {
  // handle the event  
}

// call the component API
jayElement.item.doSomething('string', new Date());
```
   
# The Jay Component API

* [Component Construction function](#componentConstruction)
* [createState](#createState)
* [createEffect](#createEffect)
* [createMemo](#createMemo)


## <a name="componentConstruction">Component Construction function</a>

The component construction function is a function that creates the logic of the component. 
It is inspired by [solid.js](https://www.solidjs.com/) and unlike React, the function is called 
only once on component construction (In React, the function is called on each render cycle).

The function signature is 
```typescript

type Getter<T> = () => T
type RenderResult<VS> = {
    [K in keyof VS]: VS[K] | Getter<VS[K]>
}
interface JayComponentCore<ViewState> {
    render: () => RenderResult<ViewState>
}

type Prop<PropsT> = {
    [K in keyof PropsT]: () => PropsT[K]
}

type JayComponentConstruction<PropsT, ViewState, 
    JayElementT extends JayElement<ViewState>,
    CompCore extends JayComponentCore<Props, ViewState>> = 
    (props: Props<PropsT>, element: JayElementT) => CompCore
```

The function is expected to return an object with the public API of the component and a 
`render` function which transforms the component props and state to the element's view state.

The simplest component will then take the form 

```typescript
export function Component() {
    return {
        render: () => {
            text: 'hello world'
        }
    }
}
```

The render function signature, given the element view state type `VS` has to conform to the following
`() => RenderResult<ViewState>`. `RenderResult<VS>` transforms `VS` from an object of values to
an object of values or getters. This enables using props, state or memo getters directly in a render function.

```typescript
export function Component({role}: Props<ComponentProps>) {
    let [age, setAge] = createState(props.initialAge());
    let [firstName, setFirstName] = createState('');
    let [lastName, setLastName] = createState('');
    
    let fullName = createMemo(() => `${lastName()} ${firstName}`);
    
    return {
        render: () => ({
            age, // a state getter
            fullName, // a memo getter
            role // a props getter   
        })
    }
}
```

## <a name="props">props</a>

Inspired by solid.js, the properties are passed to the component as a Proxy object which track access
to the props. On each prop change, `render`, `createMemo` and `createEffect` are running.

we define a type transformation `Props<T>` which transforms an object of values to an object of getters.
This pattern allows decomposition of props as follows

```typescript
interface ComponentProps {
    name: string,
    age: number
}

export function Component({name, age}: Props<ComponentProps>) {
    return {
        render: () => ({
            age, 
            text: `Hello ${name()}`              
        })
    }
}
```

## <a name="createState">createState</a>

Create state is inspired from [solid.js](https://www.solidjs.com/) and [S.js](https://github.com/adamhaile/S),
which is similar and different from React in the sense of using a getter instead of a value.

```typescript
type Next<T> = (t: T) => T 
type Setter<T> = (t: T | Next<T>) => T 
type Getter<T> = () => T 
declare function createState<T>(value: T): 
    [get: Getter<T>, set: Setter<T>];
```

and it is used as 
```typescript
let initialValue = 'some initial value';
const [getState, setState] = createState(initialValue);

// read value
getState();

// set value
let nextValue = 'some next value';
setState(nextValue);

// set value with a function setter
let next = ' and more';
setState((prev) => prev + next);
```

## <a name="createEffect">createEffect</a>

createEffect is inspired by React [useEffect](https://reactjs.org/docs/hooks-effect.html) in the sense that it is 
run any time any of the dependencies change and can return a cleanup function. Unlike React, the dependencies
are tracked automatically like in Solid.js.

```typescript

type Clean = () => void
declare function createEffect(effect: () => void | cleanup);
```

it can be used for computations, for instance as a timer that ticks every `props.delay()` milisecs.

```typescript
let [time, setTime] = createState(0)
createEffect(() => {
    let timer = setInterval(() => setTime(time => time + props.delay()), props.delay())
    return () => {
        clearInterval(timer);
    }
})
```

## <a name="createMemo">createMemo</a>

createMemo is inspired by Solid.js [createMemo](https://www.solidjs.com/docs/latest/api#creatememo).
It creates a computation that is cached until dependencies change and return a single getter.
For Jay Components memos are super important as they can be used directly to construct the render function
in a very efficient way.

```typescript
type Getter<T> = () => T
declare function createMemo<T>(computation: (prev: T) => T, initialValue?: T);
```

```typescript
let [time, setTime] = createState(0)
let currentTime = createMemo(() => `The current time is ${time()}`)
```



      
## The component Type Mapping
We can make this happen using mapped types using the following type transformations (which look a bit complicated) which are

1. The `makeJayComponent` accepts two parameters - a `JayElement` render function and a 
   component construction function, that given props proxy and the element returns an object extending `JayComponentCore`
   1. The returned `JayComponentCore` is required to have a `render` function
   2. The returned `JayComponentCore` can have functions which are a public API of the component
   3. The returned `JayComponentCore` can have `EventEmitter` instances to define events
2. The type transformation
   1. transforms the input `ComponentProps` into a `Props<ComponentProps>` proxy which transforms property values into getter functions
   2. removes the `render` function on the returned object
   3. transforms `EventEmitter<E, H>` into type `H` on the returned object
   4. adds the `JayComponent` interface to the component 
3. The `makeJayComponent` needs to implement the transformed component public type over the component core type, 
   probably using a `Proxy`.

```typescript
type Getter<T> = () => T
type RenderResult<VS> = {
    [K in keyof VS]: VS[K] | Getter<VS[K]>
}
type Prop<PropsT> = {
   [K in keyof PropsT]: Getter<PropsT[K]>
}

interface JayComponentCore<Props, ViewState> {
    render: () => RenderResult<ViewState>
}

class EventEmitter<Event, Handler extends (e: Event) => void> {
    handler?: Handler

    emit(e: Event): void {
        if (this.handler)
            this.handler(e);
    }
    on(handler: Handler) {
        this.handler = handler;
    }
}

type ConcreteJayComponent1<PropsT, ViewState,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState>> =
    Omit<CompCore, 'render'> & JayComponent<PropsT, ViewState, JayElementT>

type ConcreteJayComponent<PropsT, ViewState,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState>,
    CJC extends ConcreteJayComponent1<PropsT, ViewState, CompCore, JayElementT>> = {
    [K in keyof CJC]: CJC[K] extends EventEmitter<infer T, infer F> ? F : CJC[K]
}

declare function makeJayComponent<PropsT, ViewState, JayElementT extends JayElement<ViewState>,
    CompCore extends JayComponentCore<PropsT, ViewState>>(
        
    render: (vs: ViewState) => JayElementT,
    comp: (props: Prop<PropsT>, element: JayElementT) => CompCore): 
      ConcreteJayComponent<PropsT, ViewState, CompCore, JayElementT, ConcreteJayComponent1<PropsT, ViewState, CompCore, JayElementT>>

```


                        



## some reference for a full working type system

```typescript
interface updateFunc<T> {
    (newData:T): void
    _origUpdates?: Array<updateFunc<T>>
}
type mountFunc = () => void;

export interface JayElement<ViewState> {
    dom?: HTMLElement,
    update: updateFunc<ViewState>
    mount: mountFunc,
    unmount: mountFunc
}

export interface JayComponent<PropsT, ViewState, JayElementT extends JayElement<ViewState>>{
    element: JayElementT
    update: updateFunc<PropsT>
    mount: mountFunc,
    unmount: mountFunc
}

interface JayComponentCore<PropsT, ViewState> {
    render: () => ViewState
}

type ConcreteJayComponent1<PropsT, ViewState,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState>> =
    Omit<CompCore, 'render'> & JayComponent<PropsT, ViewState, JayElementT>

type ConcreteJayComponent<PropsT, ViewState,
    CompCore extends JayComponentCore<PropsT, ViewState>,
    JayElementT extends JayElement<ViewState>,
    CJC extends ConcreteJayComponent1<PropsT, ViewState, CompCore, JayElementT>> = {
    [K in keyof CJC]: CJC[K] extends EventEmitter<infer T, infer F> ? F : CJC[K]
}

type Prop<PropsT> = {
    [K in keyof PropsT]: () => PropsT[K]
}

declare function makeJayComponent<PropsT, ViewState, JayElementT extends JayElement<ViewState>,
    CompCore extends JayComponentCore<PropsT, ViewState>
    >(
    render: (vs: ViewState) => JayElementT,
    comp: (props: Prop<PropsT>, element: JayElementT) => CompCore): ConcreteJayComponent<PropsT, ViewState, CompCore, JayElementT, ConcreteJayComponent1<PropsT, ViewState, CompCore, JayElementT>>



interface Data {
    one: string,
    two: number
}

const render = (vs: Data): ConcreteElement => ({dom: undefined, update: (vs: Data) => {}, mount: () => {}, unmount: () => {}});

interface CompProps {
    one: string
}
interface ConcreteElement extends JayElement<Data> {}
class EventEmitter<T, F extends (t: T) => void> {
    handler?: F

    emit(t: T): void {
        if (this.handler)
            this.handler(t);
    }
    on(handler: F) {
        this.handler = handler;
    }
}

const compConstructor = (props: Prop<CompProps>, element: ConcreteElement) => {
    const onremove = new EventEmitter<void, () => void>();
    return {
        render: (): Data => {
            return ({one: props.one(), two: 2})
        },
        api: () => {},
        onremove
    }
}
let comp = makeJayComponent(render, compConstructor)

comp.

```