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

export function Item(props: ItemData, je: ItemElement): ItemComponent {
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

We can make this happen using mapped types using the following type transformations (which look a bit complicated) which are

1. The `makeJayComponent` accepts two parameters - a `JayElement` render function and a 
   component construction function, that given props and the element returns an object extending `JayComponentCore`
   1. The returned `JayComponentCore` is required to have a `render` function
   2. The returned `JayComponentCore` can have functions which are a public API of the component
   3. The returned `JayComponentCore` can have `EventEmitter` instances to define events
2. The type transformation
   1. removes the `render` function
   2. transforms `EventEmitter<E, H>` into type `H`
   3. adds the `JayComponent` interface to the component
3. The `makeJayComponent` needs to implement the transformed component public type over the component core type, 
   probably using a `Proxy`.

```typescript
interface JayComponentCore<Props, ViewState> {
    render: () => ViewState
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

type ConcreteJayComponent1<
    Props, 
    ViewState,
    jayComponentConstructor extends JayComponentConstructor<Props, ViewState>,
    jayElement extends JayElement<ViewState>> =
    Omit<jayComponentConstructor, 'render'> & JayComponent<Props, ViewState, jayElement>

type ConcreteJayComponent<
    Props, 
    ViewState,
    jayComponentConstructor extends JayComponentConstructor<Props, ViewState>,
    jayElement extends JayElement<ViewState>,
    CJC extends ConcreteJayComponent1<Props, ViewState, jayComponentConstructor, jayElement>> = {
    [K in keyof CJC]: CJC[K] extends EventEmitter<infer E, infer H> ? H : CJC[K]
}

declare function makeJayComponent<
    Props, 
    ViewState, 
    jayElement extends JayElement<ViewState>,
    compCore extends JayComponentCore<Props, ViewState>,
    component extends JayComponent<Props, ViewState, jayElement>>(
        
    render: (vs: ViewState) => jayElement,
    comp: (props: Props, element: jayElement) => compCore):

    ConcreteJayComponent<Props, ViewState, compCore, jayElement, ConcreteJayComponent1<Props, ViewState, compConstructor, jayElement>>
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

export interface JayComponent<Props, ViewState, jayElement extends JayElement<ViewState>>{
    element: jayElement
    update: updateFunc<Props>
    mount: mountFunc,
    unmount: mountFunc
}

interface JayComponentConstructor<Props, ViewState> {
    render: () => ViewState
}

type ConcreteJayComponent<Props, ViewState,
    cnst extends JayComponentConstructor<Props, ViewState>,
    jayElement extends JayElement<ViewState>> =
    Omit<cnst, 'render'> & JayComponent<Props, ViewState, jayElement>

type ConcreteJayComponent2<Props, ViewState,
    cnst extends JayComponentConstructor<Props, ViewState>,
    jayElement extends JayElement<ViewState>,
    CJC extends ConcreteJayComponent<Props, ViewState, cnst, jayElement>> = {
    [Property in keyof CJC]: CJC[Property] extends EventEmitter<infer T, infer F> ? F : CJC[Property]
}


declare function makeJayComponent<Props, ViewState, jayElement extends JayElement<ViewState>,
    compConstructor extends JayComponentConstructor<Props, ViewState>,
    component extends JayComponent<Props, ViewState, jayElement>
    >(
    render: (vs: ViewState) => jayElement,
    comp: (props: Props, element: jayElement) => compConstructor): ConcreteJayComponent2<Props, ViewState, compConstructor, jayElement, ConcreteJayComponent<Props, ViewState, compConstructor, jayElement>>



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

const compConstructor = (props: CompProps, element: ConcreteElement) => {
    const onremove = new EventEmitter<void, () => void>();
    return {
        render: (): Data => {
            return ({one: props.one, two: 2})
        },
        api: () => {},
        onremove
    }
}
let comp = makeJayComponent(render, compConstructor)

comp.onremove
```