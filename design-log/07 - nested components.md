Working on nested components
====

adding nested components to Jay seems simple. A Component is built using a Jay Element and can easily be made to conform
to the Jay Element interface.

Nesting a component into a Jay Element creates the relationship of

```
Jay Element -> Jay Component -> Jay Element -> Jay Component -> Jay Element
```

We define a Jay Element initially as

```typescript
interface JayComponent<Props, ViewState, jayElement extends JayElement<ViewState>> {
    element: jayElement;
    update: updateFunc<Props>;
    mount: mountFunc;
    unmount: mountFunc;
}
```

While the JayComponent is very similar to a JayElement, they are still different in some aspects. The `childComp`
constructor adjusts a JayComponent to the JayElement interface, allowing a JayComponent to be a direct child of
JayElement

```typescript
declare function childComp<ParentT, Props, ChildT,
    ChildElement extends JayElement<ChildT>,
    ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    compCreator: (props: Props) => ChildComp,
    getProps: (t: ParentT) => Props
): JayElement<ParentT>;
```

and the usage within a compiled Jay File is those

```typescript
e('div', {}, [
    childComp(
        (props: ItemData) => Item(props),
        vs => ({text: vs.staticItem, dataId: 'AAA'})
    )
])
```

# References and Events

When we have nested components, in most cases the parent component will also require a reference to the nested
component, and the ability to add event handlers to the component.

There are a number of methods of adding such events - namely

## 1. Callback Functions

Using callback functions as part of the component Props. The downside of this option is that for each update, we create
new closures and that is it very verbose.

Assuming we have an Item component, it will look like

`item.jay.html`

```html

<html>
<head>
    <script type="application/yaml-jay">
data:
    text: string
    done: boolean
    dataId: string    
    
    </script>
</head>
<body>
<div data-id={dataId}>
    <span>{text} - {done?done:tdb}</span>
    <button ref="done">done</button>
    <button ref="remove">remove</button>
</div>
</body>
</html>
```

`item.ts`

```typescript
import {render, ItemVS, ItemElement} from './item.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

export interface ItemData {
    text: string,
    dataId: string,
    onRemove: () => void
}

export interface ItemComponent extends JayComponent<ItemData, ItemVS, ItemElement> {
}

export function Item(props: ItemData): ItemComponent {
    const [text, setText] = createState(props.text);
    const [done, setDone] = createState(false);

    jayElement.done.onclick = () => setDone(!done());
    jayElement.remove.onclick = () => onRemove();

    return () => ({
        text: text(),
        done: done(),
        dataId: props.dataId
    })
}

export default makeJayComponent(render, Item);
```

and an element and component using the item Component will look like

`parent.jay.html`

```html

<html>
<head>
    <script type="application/yaml-jay">
data:
    text: string
    onRemove: function    
    
    </script>
</head>
<body>
<div>
    <Item text={text} data-id="AAA" on-remove={onRemove}></Item>
</div>
</body>
</html>
```

```typescript
// GENERATED ELEMENT CODE FROM A JAY FILE
interface ParentVS {
    text: string,
    onRemove: () => void
}

interface ParentElement extends JayElement<ParentVS> {
}

function renderComposite(viewState: ViewState): TestElement {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
            childComp((props: ItemData) => Item(props),
                vs => ({text: vs.text, dataId: 'AAA', onRemove: vs.onRemove}))
        ])
    ) as ParentElement;
}
```

`parent.ts`

```typescript
import {render, ParentVS, ParentElement} from './parent.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

export interface ParentProps {
}

export interface ParentComponent extends JayComponent<ParentProps, ParentVS, ParentElement> {
}

export function Parent(props: ParentProps, je: ParentElement): ParentComponent {
    const [removed, setRemoved] = createState(false);

    return () => ({
        text: 'some text for the child component',
        onremove: () => doSomethingOnRemove()
    })
}

export default makeJayComponent(render, Item);
```

We can see that this pattern is verbose - it requires the Parent Element to explicitly map events and for the parent
element type to include the specific event types.

We do not believe this is the best option.

## 2. Event Registers

Using event registers similar to `HTMLComponent`

With this option, we first extend the Item component to have an event registrar. We add a `EventRegistrar` to the
component type and use a new hook to invoke the event. The item component looks like

`item.jay.html`

```html

<html>
<head>
    <script type="application/yaml-jay">
data:
    text: string
    done: boolean
    dataId: string    
    
    </script>
</head>
<body>
<div data-id={dataId}>
    <span>{text} - {done?done:tdb}</span>
    <button ref="done">done</button>
    <button ref="remove">remove</button>
</div>
</body>
</html>
```

`item.ts`

```typescript
import {render, ItemVS, ItemElement} from './item.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

export interface ItemData {
    text: string,
    dataId: string
}

// not sure we need to code the component interface - potentially it can be virtually created using TS language service 
export interface ItemComponent extends JayComponent<ItemData, ItemVS, ItemElement> {
    onremove: () => void
}

export function Item(props: ItemData, je: ItemElement): ItemComponent {
    const [text, setText] = createState(props.text);
    const [done, setDone] = createState(false);
    const onremove = createEvent('remove');

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

Note that the `createEvent` function is not type safe in the sense that it and the `ItemComponent`
interface are not type related. This means that the developer has to write the event twice - once in the `createEvent`
and secondly in the component type declaration.

**It is interesting to note that the call `makeJayComponent` has all the information to generate the component
interface. Can we make the component interface auto-generated?**

It looks like we can, instead of auto generate the component interface, create code completion for the component public
interface without actually coding or generating an interface, using a typescript
[language service plugin](https://github.com/microsoft/TypeScript-wiki/blob/main/Writing-a-Language-Service-Plugin.md)

the element

`parent.jay.html`

```html

<html>
<head>
    <script type="application/yaml-jay">
data:
    text: string
    
    </script>
</head>
<body>
<div>
    <Item ref="item" text={text} data-id="AAA"></Item>
</div>
</body>
</html>
```

```typescript
// GENERATED ELEMENT CODE FROM A JAY FILE
interface ParentVS {
    text: string
}

interface ParentElement extends JayElement<ParentVS> {
    item: Item
}

function renderComposite(viewState: ViewState): TestElement {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
            childComp({ref: 'item'}, (props: ItemData) => Item(props),
                vs => ({text: vs.text, dataId: 'AAA'}))
        ])
    ) as ParentElement;
}
```

`parent.ts`

```typescript
import {render, ParentVS, ParentElement} from './parent.jay.html';
import {createEffect, createState, createEvents, makeJayComponent} from 'jay-hooks';

export interface ParentProps {
}

// not sure we need to code the component interface - potentially it can be virtually created using TS language service
export interface ParentComponent extends JayComponent<ParentProps, ParentVS, ParentElement> {
}

export function Parent(props: ParentProps, je: ParentElement): ParentComponent {
    const [removed, setRemoved] = createState(false);

    je.item.onremove = () => doSomethingOnRemove()
    return () => ({
        text: 'some text for the child component'
    })
}

export default makeJayComponent(render, Item);
```

                        
                        
