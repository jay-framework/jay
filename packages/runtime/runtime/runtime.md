# Runtime Implementation

While in Jay the Jay compiler generates the code for `JayElement` from `jay-html` files, the below explains how to
code Jay elements directly. In most cases, it is not to be coded directly.

```typescript
import { element as e, dynamicText as dt, ConstructContext } from 'jay-runtime';

interface ViewState {
  text: string;
  text2: string;
}

export default function render(viewState: ViewState) {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt((vs) => vs.text)]),
      e('div', {}, ['static']),
      e('div', {}, [dt((vs) => vs.text2)]),
    ]),
  );
}
```

# Jay element building blocks

## element

The `element` function creates a simple 'static' element - element who has a fixed number of dom children. The static
element itself can have dynamic attributes or inner text. To create dynamic number of dom children use `dynamicElement`
discussed below.

The `element` function signature is

```typescript
declare function element<ViewState>(
  tagName: string,
  attributes: Attributes<ViewState>,
  children?: Array<JayElement<ViewState> | TextElement<ViewState> | string>,
): BaseJayElement<ViewState>;
```

at which

- `ViewState` - is the type of the current view state, used as input to the update function for this element
- `tagName` - the name of the HTML tag, like `div` or `button`
- `attributes` - an object who's keys are attribute names, and values are static attributes values (strings), dynamic
  attributes `DynamicAttribute<T>` or dynamic properties `DynamicProperty<T>`
- `children` - the children of the element - can be more elements, static text (string) or dynamic text (TextElement<T>)

Given the Jay HTML

```html
<button>-</button>
```

It is compiled into

```javascript
import { element as e } from 'jay-runtime';
e('button', {}, ['-']);
```

## Static Text Content

Static text content is supported as a string constant that is passed as a member of the `children` parameter of the
`element` or `dynamicElement` functions.

A simple example

```typescript
e('div', {}, ['some static text']);
```

## Static Attribute Value

Static attribute values are supported as a string constant that is passed as a member of the `attributes` parameter of
the
`element` or `dynamicElement` functions.

A simple example

```typescript
e(
  'div',
  {
    'data-attribute': 'some static value',
    class: 'class1  class2',
    style: {
      border: '1px solid red',
      'border-radius': '5px',
    },
  },
  [],
);
```

## dynamicElement

Dynamic element is a constructor for an element that supports dynamic adding and removing children. Internally, it is
using a [Kindergarten](kindergarten.md) to manage groups of childrens.

The signature of dynamic element is

```typescript
declare function dynamicElement<TViewState>(
  tagName: string,
  attributes: Attributes<TViewState>,
  children?: Array<
    | Conditional<TViewState>
    | ForEach<TViewState, any>
    | TextElement<TViewState>
    | JayElement<TViewState>
    | string
  >,
): BaseJayElement<TViewState>;
```

at which

- `ViewState` - is the type of the current view state, used as input to the update function for this element
- `tagName` - the name of the HTML tag, like `div` or `button`
- `attributes` - an object who's keys are attribute names, and values are static attributes values (strings), dynamic
  attributes `DynamicAttribute<T>` or dynamic properties `DynamicProperty<T>`
- `children` - the children of the element - can be any of
    - `Conditional` - for supporting conditional children, using the `if` directive in the jay file
    - `ForEach` - for supporting collection children, using the `forEach` directive in the jay file
    - `elements` - for child elements, who can be dynamic, but the element inclusion itself is static
    - static text (string)
    - dynamic text (TextElement<T>)

## dynamicText

Dynamic Text creates a text element that is dynamic and can be updated as data changes.

Dynamic text looks like

```typescript
import { dynamicText as dt } from 'jay-runtime';
dt((vs) => vs.text);
dt((vs) => `${vs.firstName} ${vs.lastName}`);
```

The signature of dynamic text is

```typescript
declare function dynamicText<ViewState>(
  textContent: (vs: ViewState) => string,
): TextElement<ViewState>;
```

at which

- `textContent` - a function that renders the text from the current data item

## dynamicAttribute

Dynamic Attribute creates an attribute whos value updates as the data changes.

Dynamic Attribute looks like

```typescript
{
    "class": da(vs => `${vs.bool1 ? 'main' : 'second'}`)
}
```

The signature of dynamic attribute is

```typescript
declare function dynamicAttribute<ViewState, S>(
  attributeValue: (data: ViewState) => string,
): DynamicAttribute<ViewState>;
```

at which

- `attributeValue` - a function that renders the attribute value from the current data item

## dynamicProperty

Dynamic Property creates a property whos value updates as the data changes.

Dynamic Property looks like

```typescript
{
  textContent: dp((vs) => `${vs.bool1 ? 'main' : 'second'}`);
}
```

The signature of dynamic property is

```typescript
declare function dynamicAttribute<ViewState, S>(
  propertyValue: (data: ViewState) => string,
): DynamicAttribute<ViewState>;
```

at which

- `propertyValue` - a function that renders the property value from the current data item

## Jay Component

Jay Components are logic wrappers over a Jay Element, and can be coded using any coding methodology. They have to
conform to the Jay Component interface below

```typescript
interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>> {
  element: jayElement;
  update: updateFunc<Props>;
  mount: mountFunc;
  unmount: mountFunc;
}
```

at which

- `Props` are the type of the component propeties, used to create and update the component
- `ViewState` is the data type of the component's element
- `jayElement` is the concrete type of the component's element
- `element` is a JayElement of this component
- `update`, `mount` and `unmount` have the same signature as the Jay Element functions allowing the component to wrap
  the element functions to add update and lifecycle logic.

## childComp

Child components are components nested into the jay file of another component. The nesting itself is done using
the `childComp` constructor which accepts a function that returns a `JayComponent`

using child components looks like

```typescript
childComp(
  (props: ItemData) => Item(props),
  (vs) => ({ text: vs.staticItem }),
);
```

The signature of `childComp` is

```typescript
declare function childComp<
  ParentT,
  Props,
  ChildT,
  ChildElement extends JayElement<ChildT>,
  ChildComp extends JayComponent<Props, ChildT, ChildElement>,
>(
  compCreator: (props: Props) => ChildComp,
  getProps: (t: ParentT) => Props,
): BaseJayElement<ParentT>;
```

at which

- `ParentT` is the view data type of the parent element
- `Props` is the type of the component properties
- `ChildT` is the view data type of the child component element
- `ChildElement` is the child component element type
- `childComp` is the child component type
- `compCreator` is a function that given props, returns the component instance
- `getProps` is a function that given the parent element view state, returns the props of the component

## forEach

```typescript
declare function forEach<ViewState, Item>(
  getItems: (T: any) => Array<Item>,
  elemCreator: (Item: any) => JayElement<Item>,
  matchBy: string,
): ForEach<ViewState, Item>;
```

## conditional

```typescript
declare function conditional<ViewState>(
  condition: (newData: ViewState) => boolean,
  elem: JayElement<ViewState> | TextElement<ViewState> | string,
): Conditional<ViewState>;
```

## ConstructionContext

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
    elementConstructor: () => BaseJayElement<T>,
  ): JayElement<T>;
}
```
