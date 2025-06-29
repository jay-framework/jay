# Refs

The `Refs` type is one of the generated types for a `jay-html`.
For each `ref` attribute in the `jay-html`, a member is created in the `refs` type.

## Examples of Refs Types

```typescript
export interface TodoElementRefs {
  newTodo: HTMLElementProxy<TodoViewState, HTMLInputElement>;
  toggleAll: HTMLElementProxy<TodoViewState, HTMLInputElement>;
  items: ItemRefs<ShownTodo>;
  filterAll: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
  filterActive: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
  filterCompleted: HTMLElementProxy<TodoViewState, HTMLAnchorElement>;
  clearCompleted: HTMLElementProxy<TodoViewState, HTMLButtonElement>;
}
```

Jay runtime includes 4 type of Refs - `HTMLElementProxy`, `HTMLElementCollectionProxy`,
`the component`, `ComponentCollectionProxy`. The first are used directly, while the latter are use indirectly via
a generated `component-refs.ts` file.

The generated `component-refs.ts` file, for example for the `items` property above is

```typescript
import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from '@jay-framework/runtime';
import { Item } from './item';

export type ItemComponentType<ParentVS> = ReturnType<typeof Item<ParentVS>>;

export interface ItemRefs<ParentVS>
  extends ComponentCollectionProxy<ParentVS, ItemComponentType<ParentVS>> {
  onCompletedToggle: EventEmitter<
    EventTypeFrom<ItemComponentType<ParentVS>['onCompletedToggle']>,
    ParentVS
  >;
  onRemove: EventEmitter<EventTypeFrom<ItemComponentType<ParentVS>['onRemove']>, ParentVS>;
  onTitleChanged: EventEmitter<
    EventTypeFrom<ItemComponentType<ParentVS>['onTitleChanged']>,
    ParentVS
  >;
}
```

And the component type is `ItemComponentType` while the `ComponentCollectionProxy` type is `ItemRefs`.

## JayEventHandler

The `refs` enable to listen on events from elements or components.
All Jay Events are using the `JayEventHandler` type

```typescript
export type Coordinate = string[];
export interface JayEvent<EventType, ViewState> {
  event: EventType;
  viewState: ViewState;
  coordinate: Coordinate;
}
export type JayEventHandler<EventType, ViewState, Returns> = (
  event: JayEvent<EventType, ViewState>,
) => Returns;
```

- `JayEventHandler`: the event callback function, called when an event is emitted.
- `event: JayEvent<EventType, ViewState>`: the parameter of the handler, holding all the event data and context
- `event.event: EventType`: the type of the event. For DOM elements, this is the native browser event
  (if allowed by access security patterns). For components, this is the emitted component event.
- `event.viewState: ViewState`: the ViewState at the location of the element or component. Useful to get the context
  of repeated items
- `coordinate: Coordinate`: an array of id's from nested `forEach` element structures, to get the logical location
  of the element or component who triggered the event.

## HTMLElementProxy

The `HTMLElementProxy` is a proxy for a single dom element ref.
The `HTMLElementProxy` effective type (simplified view) is

```typescript
interface HTMLElementProxy<ViewState, ElementType extends HTMLElement>
  extends GlobalJayEvents<ViewState> {
  addEventListener<E extends Event>(
    type: string,
    handler: JayEventHandler<E, ViewState, any>,
    options?: boolean | AddEventListenerOptions,
  );

  removeEventListener<E extends Event>(
    type: string,
    handler: JayEventHandler<E, ViewState, any>,
    options?: EventListenerOptions | boolean,
  );

  exec$<ResultType>(
    handler: JayNativeFunction<ElementType, ViewState, ResultType>,
  ): Promise<ResultType>;
}
```

- `onclick`, `oninput`, `on...`: named event handlers to register new event handlers.
- `addEventListener`: registers a new event handlers.
- `removeEventListener`: registers a new event handlers.
- `exec$`: runs a code function against the DOM element. The function must match compiler patterns (see the compiler security section)
  to be property run in secure applications. In non-secure applications, the function just runs with the DOM element.

## HTMLElementCollectionProxy

The `HTMLElementCollectionProxy` is a proxy for a collection of DOM elements with the same ref, normally
children of one or more `forEach` element creator functions or `jay-html` directives.
The `HTMLElementCollectionProxy` effective type (simplified view) is

```typescript
interface HTMLElementCollectionProxy<ViewState, ElementType extends HTMLElement>
  extends GlobalJayEvents<ViewState> {
  addEventListener<E extends Event>(
    type: string,
    handler: JayEventHandler<E, ViewState, any>,
    options?: boolean | AddEventListenerOptions,
  );

  removeEventListener<E extends Event>(
    type: string,
    handler: JayEventHandler<E, ViewState, any>,
    options?: EventListenerOptions | boolean,
  );

  find(
    predicate: (t: ViewState, c: Coordinate) => boolean,
  ): HTMLNativeExec<ViewState, ElementType> | undefined;

  map<ResultType>(
    handler: (
      element: HTMLNativeExec<ViewState, ElementType>,
      viewState: ViewState,
      coordinate: Coordinate,
    ) => ResultType,
  ): Array<ResultType>;
}
```

- `onclick`, `oninput`, `on...`: named event handlers to register new event handlers for all the underlying elements.
- `addEventListener`: registers a new event handlers for all the referenced elements.
- `removeEventListener`: registers a new event handlers for all the referenced elements.
- `find`: finds the first DOM element who matches the predicate by the element view state or coordinate.
  Once found, the element can be interacted with the `exec$` function of `HTMLElementProxy`.
- `map`: similar to an array map, this function runs for all the referenced DOM elements, given the
  view state, coordinate and the element proxy with the `exec$` function of `HTMLElementProxy`.

> understanding nested ViewState and Coordinate:
> when using nested forEach structures, forEach mandates that each array element has an id property named by matchBy.
> the element of the array is the ViewState, and the coordinate holds the id's path.
> for a single forEach, the array item will be the view state, while the id of the item will be the coordinate.
> for nested forEach, the most nested array item will be the view state, while the id's of all parents will be the coordinate.

## The component

For a single component (not under `forEach`), the ref is just a proxy to the component directly and has the same interface
as the component.

**One important note - while the component constructor is running, the component ref is not initialized yet as the
component was not rendered yet. It is safe to set event handlers on the component, but calling the component APIs is only
supported on later times, such as event handlers or async code.**

## ComponentCollectionProxy

For a collection of components, components nested under `forEach`, Jay generates a type for each component based on
`ComponentCollectionProxy`, adding to it the component named event handlers.

The actual refs type is then `ComponentRefs` extending the `ComponentCollectionProxy` type

```typescript
interface ComponentRefs<ParentVS>
  extends ComponentCollectionProxy<ParentVS, ComponentType<ParentVS>> {}

interface ComponentCollectionProxy<ViewState, ComponentType extends JayComponent<any, any, any>> {
  addEventListener(
    type: string,
    handler: JayEventHandler<any, ViewState, void>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    handler: JayEventHandler<any, ViewState, void>,
    options?: EventListenerOptions | boolean,
  ): void;

  map<ResultType>(
    handler: (comp: ComponentType, viewState: ViewState, coordinate: Coordinate) => ResultType,
  ): Array<ResultType>;
  find(predicate: (t: ViewState) => boolean): ComponentType | undefined;
}
```

- `named event handlers`: The named event handlers of the component
- `addEventListener`: registers a new event handlers for all the referenced components.
- `removeEventListener`: registers a new event handlers for all the referenced components.
- `find`: finds the first component who matches the predicate by the component view state or coordinate.
  Once found, the component can be interacted with directly.
- `map`: similar to an array map, this function runs for all the referenced components , given the
  view state, coordinate and the component.
