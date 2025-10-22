# Generated JayElement creation Functions

> note: this is an "how it works doc"

While in Jay the Jay compiler generates the code for `JayElement` from `jay-html` files, the below explains how to
code Jay elements directly. In most cases, it is not to be coded directly.

```typescript
import { element as e, dynamicText as dt, ConstructContext } from '@jay-framework/runtime';

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
import { element as e } from '@jay-framework/runtime';
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
import { dynamicText as dt } from '@jay-framework/runtime';
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

## injectHeadLinks

The `injectHeadLinks` function injects `<link>` elements into the document head. This is primarily used by the Jay compiler to automatically inject head links defined in Jay-HTML files.

The function is used in client only use cases. For jay-stack, it is expected that slowly or fast rendering will handle links and this function will not be used.

```typescript
import { injectHeadLinks, HeadLink } from '@jay-framework/runtime';

// Basic usage
injectHeadLinks([
  { rel: 'stylesheet', href: 'styles/main.css' },
  { rel: 'icon', href: '/favicon.ico' },
]);

// With additional attributes
injectHeadLinks([
  {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
    attributes: { crossorigin: '' },
  },
  {
    rel: 'alternate',
    href: '/feed.xml',
    attributes: {
      type: 'application/rss+xml',
      title: 'RSS Feed',
    },
  },
]);
```

The `HeadLink` interface:

```typescript
interface HeadLink {
  rel: string;
  href: string;
  attributes?: Record<string, string>;
}
```

**Features**:

- **Duplicate Prevention**: Automatically prevents duplicate links by checking both `href` and `rel` attributes
- **Attribute Support**: Supports all standard HTML link attributes via the `attributes` property
- **Safe Injection**: Gracefully handles missing `document.head` and other edge cases
- **Runtime Only**: Designed for browser environments where `document` is available

**Generated Code**: The Jay compiler automatically generates calls to `injectHeadLinks` when Jay-HTML files contain `<link>` elements in the `<head>` section.

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

The `forEach` function creates a dynamic collection of child elements that automatically updates when the underlying array data changes. It efficiently manages adding, removing, and reordering child elements based on a tracking key.

`forEach` is used within a `dynamicElement` to render lists of items, where each item in the array becomes a separate child element. The runtime intelligently tracks elements by a specified key property to minimize DOM manipulations during updates.

```typescript
declare function forEach<ViewState, Item>(
  getItems: (vs: ViewState) => Array<Item>,
  elemCreator: (item: Item, trackByValue: string) => BaseJayElement<Item>,
  trackBy: string,
): ForEach<ViewState, Item>;
```

at which

- `ViewState` - the type of the parent element's view state containing the array
- `Item` - the type of individual items in the array
- `getItems` - a function that extracts the array of items from the parent's view state
- `elemCreator` - a factory function that creates a child element for each item, receives:
  - `item` - the current item data
  - `trackByValue` - the value of the tracking key for this item (useful for setting element IDs)
- `trackBy` - the property name used to track elements across updates (typically an `id` or `key` field)

The `trackBy` parameter is crucial for performance - it tells Jay how to identify which elements are the same across updates, enabling efficient reordering and minimizing unnecessary DOM operations.

Example usage for a simple list:

```typescript
import { forEach, dynamicElement as de, element as e, dynamicText as dt } from '@jay-framework/runtime';

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

interface ViewState {
  todos: TodoItem[];
}

de('ul', { class: 'todo-list' }, [
  forEach(
    (vs) => vs.todos,
    (item: TodoItem) =>
      e('li', { id: item.id, class: item.completed ? 'completed' : '' }, [
        dt((item) => item.text),
      ]),
    'id',
  ),
]);
```

Example with nested structure:

```typescript
interface Message {
  id: string;
  author: string;
  text: string;
  timestamp: number;
}

interface ChatViewState {
  messages: Message[];
}

de('div', { class: 'chat' }, [
  forEach(
    (vs) => vs.messages,
    (msg: Message) =>
      e('div', { class: 'message', id: msg.id }, [
        e('div', { class: 'author' }, [dt((m) => m.author)]),
        e('div', { class: 'text' }, [dt((m) => m.text)]),
        e('div', { class: 'time' }, [dt((m) => new Date(m.timestamp).toLocaleTimeString())]),
      ]),
    'id',
  ),
]);
```

**Key Features**:
- **Efficient Updates**: Only modifies DOM elements that actually changed
- **Smart Reordering**: Moves existing elements rather than recreating them when order changes
- **Memory Management**: Properly unmounts removed elements
- **Empty Arrays**: Gracefully handles empty arrays and null/undefined values

The Jay-HTML compiler automatically generates `forEach` calls when encountering `forEach` attributes in Jay-HTML files.

## conditional

The `conditional` function conditionally renders a child element based on a boolean expression. When the condition is true, the element is rendered and mounted; when false, it is unmounted and removed from the DOM.

`conditional` is similar to an `if` statement in programming - it determines whether a piece of UI should be visible based on the current view state. The child element is lazily created only when the condition first becomes true.

```typescript
declare function conditional<ViewState>(
  condition: (vs: ViewState) => boolean,
  elem: () => BaseJayElement<ViewState> | TextElement<ViewState>,
): Conditional<ViewState>;
```

at which

- `ViewState` - the type of the element's view state
- `condition` - a function that evaluates to true (render element) or false (hide element)
- `elem` - a factory function that creates the conditional element (called only when condition is first true)

Example usage for showing/hiding UI elements:

```typescript
import { conditional, dynamicElement as de, element as e, dynamicText as dt } from '@jay-framework/runtime';

interface ViewState {
  isLoggedIn: boolean;
  username: string;
  hasErrors: boolean;
  errorMessage: string;
}

de('div', { class: 'header' }, [
  conditional(
    (vs) => vs.isLoggedIn,
    () => e('div', { class: 'user-info' }, [dt((vs) => `Welcome, ${vs.username}`)]),
  ),
  conditional(
    (vs) => !vs.isLoggedIn,
    () => e('button', {}, ['Login']),
  ),
  conditional(
    (vs) => vs.hasErrors,
    () => e('div', { class: 'error' }, [dt((vs) => vs.errorMessage)]),
  ),
]);
```

Example with complex conditions:

```typescript
interface FormState {
  step: number;
  isValid: boolean;
  isSubmitting: boolean;
}

de('div', { class: 'form' }, [
  conditional(
    (vs) => vs.step === 1,
    () => e('div', { class: 'step-1' }, ['Step 1: Basic Info']),
  ),
  conditional(
    (vs) => vs.step === 2,
    () => e('div', { class: 'step-2' }, ['Step 2: Details']),
  ),
  conditional(
    (vs) => vs.step === 3 && vs.isValid,
    () => e('div', { class: 'step-3' }, ['Step 3: Review']),
  ),
  conditional(
    (vs) => vs.isSubmitting,
    () => e('div', { class: 'spinner' }, ['Loading...']),
  ),
]);
```

**Key Features**:
- **Lazy Creation**: The element is only created when the condition first becomes true
- **Efficient Toggling**: Mounting/unmounting is efficient when toggling visibility
- **Clean DOM**: When false, the element is completely removed from the DOM (not just hidden)
- **Lifecycle Management**: Properly calls mount/unmount hooks when condition changes

**Note**: Complex boolean expressions with `&&` or `||` may need to be split into nested conditionals depending on the Jay-HTML parser capabilities.

The Jay-HTML compiler automatically generates `conditional` calls when encountering `if` attributes in Jay-HTML files.

## withData

The `withData` function enables context switching for child elements with a different data type. This is primarily used for recursive structures where a child element needs to operate on a subset or related piece of the parent's data.

`withData` is similar to `conditional`, but instead of checking a boolean condition, it:
1. Checks if the accessor function returns a non-null/undefined value
2. If present, renders the child element with the accessed data as its ViewState
3. If null/undefined, hides the child element

This is essential for recursive Jay-HTML structures where a node may have optional child nodes (like a tree or linked list).

```typescript
declare function withData<ParentViewState, ChildViewState>(
  accessor: (data: ParentViewState) => ChildViewState | null | undefined,
  elem: () => BaseJayElement<ChildViewState>,
): WithData<ParentViewState, ChildViewState>;
```

at which

- `ParentViewState` - the type of the parent element's view state
- `ChildViewState` - the type of the child element's view state (can be the same as parent for recursive structures)
- `accessor` - a function that extracts child data from parent data, returns null/undefined if child should not render
- `elem` - a factory function that creates the child element (called only when accessor returns non-null data)

Example usage for a binary tree structure:

```typescript
import { element as e, dynamicElement as de, withData, dynamicText as dt } from '@jay-framework/runtime';

interface TreeNode {
  value: number;
  left: TreeNode | null;
  right: TreeNode | null;
}

function renderTree(): BaseJayElement<TreeNode> {
  return e('div', { class: 'tree-node' }, [
    e('div', { class: 'value' }, [dt((vs) => vs.value)]),
    de('div', { class: 'children' }, [
      withData(
        (vs) => vs.left,
        () => renderTree(),
      ),
      withData(
        (vs) => vs.right,
        () => renderTree(),
      ),
    ]),
  ]);
}
```

Example usage for a linked list:

```typescript
interface ListNode {
  value: string;
  next: ListNode | null;
}

function renderList(): BaseJayElement<ListNode> {
  return e('div', { class: 'list-item' }, [
    e('span', {}, [dt((vs) => vs.value)]),
    de('div', { class: 'next' }, [
      withData(
        (vs) => vs.next,
        () => renderList(),
      ),
    ]),
  ]);
}
```

The generated Jay-HTML compiler automatically uses `withData` when encountering recursive regions with the `<recurse>` element and an `accessor` attribute.

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
