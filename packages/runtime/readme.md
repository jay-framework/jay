Jay Runtime
===


The Jay Runtime library is an efficient dom manipulation library, built to be the output of code generation (compiler).
The runtime basic building block is the `JayElement<T>` which is an instance returned from the `element` and `
dynamicElement functions.

## JayElement

The `JayElement<ViewState>` instance manages the dom structure, including initial dom creation, updates to the dom and
event handling.

The `JayElement<ViewState>` is defined as

```typescript
interface JayElement<ViewState> {
    dom: HTMLElement,
    update: updateFunc<ViewState>
    mount: mountFunc;
    unmount: mountFunc;
}
```

## building JayElements

The runtime library provides a number of constructor functions used to create JayElements. A Typical JayElement takes
the form of

```typescript
import {element as e, dynamicText as dt, ConstructContext} from '../../lib/element';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
            e('div', {}, [dt(vs => vs.text)]),
            e('div', {}, ['static']),
            e('div', {}, [dt(vs => vs.text2)])
        ])
    )
}
```

**Note:** this code is not intended to be written by hand - it is intended to be the compiler output. In this section we
discuss how this code works

The building blocks are

* [element()](#element)
* [Static Text Content](#text)
* [Static Attribute Values](#attribute)
* [dynamicElement()](#dynamicElement)
* [dynamicText()](#dynamicText)
* [dynamicAttribute()](#dynamicAttribute)
* [dynamicProperty()](#dynamicProperty)
* [Jay Component](#JayComponent)
* [childComp()](#childComp)
* [forEach()](#forEach)
* [conditional()](#conditional)
* [ConstructionContext](#ConstructionContext)

### <a name="element">element</a>

The `element` function creates a simple 'static' element - element who has a fixed number of dom children. The static
element itself can have dynamic attributes or inner text. To create dynamic number of dom children use `dynamicElement`
discussed below.

The `element` function signature is

```typescript
declare function element<ViewState>(
    tagName: string,
    attributes: Attributes<ViewState>,
    children?: Array<JayElement<ViewState> | TextElement<ViewState> | string>
): JayElement<ViewState>;
```

at which

* `ViewState` - is the type of the current view state, used as input to the update function for this element
* `tagName` - the name of the HTML tag, like `div` or `button`
* `attributes` - an object who's keys are attribute names, and values are static attributes values (strings), dynamic
  attributes `DynamicAttribute<T>` or dynamic properties `DynamicProperty<T>`
* `children` - the children of the element - can be more elements, static text (string) or dynamic text (TextElement<T>)

### <a name="text">Static Text Content</a>

Static text content is supported as a string constant that is passed as a member of the `children` parameter of the
`element` or `dynamicElement` functions.

A simple example

```typescript
e('div', {}, ['some static text'])
```

### <a name="attribute">Static Attribute Value</a>

Static attribute values are supported as a string constant that is passed as a member of the `attributes` parameter of
the
`element` or `dynamicElement` functions.

A simple example

```typescript
e('div', {
    "data-attribute": "some static value",
    "class": "class1  class2",
    "style": {
        "border": "1px solid red",
        "border-radius": "5px"
    }
}, [])
```

### <a name="dynamicElement">dynamicElement</a>

Dynamic element is a constructor for an element that supports dynamic adding and removing children. Internally, it is
using a [Kindergarten](kindergarten.md) to manage groups of childrens.

The signature of dynamic element is

```typescript
declare function dynamicElement<TViewState>(
    tagName: string,
    attributes: Attributes<TViewState>,
    children?: Array<Conditional<TViewState> | ForEach<TViewState, any> | TextElement<TViewState> |
        JayElement<TViewState> | string>
): JayElement<TViewState>;
```

at which

* `ViewState` - is the type of the current view state, used as input to the update function for this element
* `tagName` - the name of the HTML tag, like `div` or `button`
* `attributes` - an object who's keys are attribute names, and values are static attributes values (strings), dynamic
  attributes `DynamicAttribute<T>` or dynamic properties `DynamicProperty<T>`
* `children` - the children of the element - can be any of
    * `Conditional` - for supporting conditional children, using the `if` directive in the jay file
    * `ForEach` - for supporting collection children, using the `forEach` directive in the jay file
    * `elements` - for child elements, who can be dynamic, but the element inclusion itself is static
    * static text (string)
    * dynamic text (TextElement<T>)

### <a name="dynamicText">dynamicText</a>

Dynamic Text creates a text element that is dynamic and can be updated as data changes.

Dynamic text looks like

```typescript
dt(vs => vs.text)
dt(vs => `${vs.firstName} ${vs.lastName}`)
```

The signature of dynamic text is

```typescript
declare function dynamicText<ViewState>(
    textContent: (vs: ViewState) => string
): TextElement<ViewState>;
```

at which

* `textContent` - a function that renders the text from the current data item

### <a name="dynamicAttribute">dynamicAttribute</a>

Dynamic Attribute creates an attribute whos value updates as the data changes.

Dynamic Attribute looks like

```typescript
{
    class

:
    da(vs => `${vs.bool1 ? 'main' : 'second'}`)
}
```

The signature of dynamic attribute is

```typescript
declare function dynamicAttribute<ViewState, S>(
    attributeValue: (data: ViewState) => string
): DynamicAttribute<ViewState>;
```

at which

* `attributeValue` - a function that renders the attribute value from the current data item

### <a name="dynamicProperty">dynamicProperty</a>

Dynamic Property creates a property whos value updates as the data changes.

Dynamic Property looks like

```typescript
{
    textContent: dp(vs => `${vs.bool1 ? 'main' : 'second'}`)
}
```

The signature of dynamic property is

```typescript
declare function dynamicAttribute<ViewState, S>(
    propertyValue: (data: ViewState) => string
): DynamicAttribute<ViewState>;
```

at which

* `propertyValue` - a function that renders the property value from the current data item

### <a name="JayComponent">Jay Component</a>

Jay Components are logic wrappers over a Jay Element, and can be coded using any coding methodology. They have to
conform to the Jay Component interface below

```typescript
interface JayComponent<Props, ViewState, jayElement extends JayElement<ViewState>> {
    element: jayElement
    update: updateFunc<Props>;
    mount: mountFunc;
    unmount: mountFunc;
}
```

at which

* `Props` are the type of the component propeties, used to create and update the component
* `ViewState` is the data type of the component's element
* `jayElement` is the concrete type of the component's element
* `element` is a JayElement of this component
* `update`, `mount` and `unmount` have the same signature as the Jay Element functions allowing the component to wrap
  the element functions to add update and lifecycle logic.

### <a name="childComp">childComp</a>

Child components are components nested into the jay file of another component. The nesting itself is done using
the `childComp` constructor which accepts a function that returns a `JayComponent`

using child components looks like

```typescript
childComp(
    (props: ItemData) => Item(props),
    vs => ({text: vs.staticItem})
)
```

The signature of `childComp` is

```typescript
declare function childComp<ParentT,
    Props,
    ChildT,
    ChildElement extends JayElement<ChildT>,
    ChildComp extends JayComponent<Props, ChildT, ChildElement>>(
    compCreator: (props: Props) => ChildComp,
    getProps: (t: ParentT) => Props
): JayElement<ParentT>;
```

at which

* `ParentT` is the view data type of the parent element
* `Props` is the type of the component properties
* `ChildT` is the view data type of the child component element
* `ChildElement` is the child component element type
* `childComp` is the child component type
* `compCreator` is a function that given props, returns the component instance
* `getProps` is a function that given the parent element view state, returns the props of the component

### <a name="forEach">forEach</a>

```typescript
declare function forEach<ViewState, Item>(
    getItems: (T: any) => Array<Item>,
    elemCreator: (Item: any) => JayElement<Item>,
    matchBy: string
): ForEach<ViewState, Item>;
```

### <a name="conditional">conditional</a>

```typescript
declare function conditional<ViewState>(
    condition: (newData: ViewState) => boolean,
    elem: JayElement<ViewState> | TextElement<ViewState> | string
): Conditional<ViewState>;
```

### <a name="ConstructionContext">ConstructionContext</a>

```typescript
declare class ConstructContext<A extends Array<any>> {
    refManager: ReferencesManager;
    data: A;
    forStaticElements: boolean;

    constructor(data: A, dm?: ReferencesManager, forStaticElements?: boolean);

    get currData(): any;

    static acc<A extends Array<any>, B>(a: A, b: B): [...A, B];

    forItem<T>(t: T): ConstructContext<[...A, T]>;

    static root<T>(t: T): ConstructContext<[T]>;

    static withRootContext<T, A extends ConstructContext<[T]>>(
        t: T,
        elementConstructor: () => JayElement<T>
    ): JayElement<T>;
}
```
