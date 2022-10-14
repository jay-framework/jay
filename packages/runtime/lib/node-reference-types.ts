import {JayComponent} from "./element-types";

// export type ReferencedElement = HTMLElement | JayComponent<any, any, any>;
// // type computation to extract a type that describes the key of an object
// // who's prop types are one parameter functions or a DOM event handler
// type Func0 = () => void
// type Func1 = (x: any) => void
// type DOMeventHandler<E> = (((this: GlobalEventHandlers, ev: E) => any) | null)
// // here the conditional type matches one parameter functions
// // (which both zero and parameter functions match as zero parameter function is a subtype of one parameter function)
// // we then match on zero param function and remove the keys using `never`.
// // we then match on other cases for a DOM event handler.
// // any other case (not a one param function or DOM event handler) are removed using `never`.
// type EventHandlerKeys<T> = {
//   [P in keyof T]:
//   P extends string ?
//     (T[P] extends Func1 ?
//       (T[P] extends Func0 ? never : P) :
//       T[P] extends DOMeventHandler<any> ? P : never) :
//     never
// }[keyof T];
// // creates a type from an object, that only includes the event handler properties
// type EventHandlersOf<T> = {
//   [Q in EventHandlerKeys<T>]: T[Q]
// };
// // create a function type that given a function event handler,
// // creates a new type which
// // - if the original function is a DOM event handler, creates a function that accepts an event handler,
// //   which in turn accepts ViewState and coordinate
// // - for component functions, creates a function that accepts an event handler,
// //   which in turn accepts the component event object, ViewState and coordinate.
// type JayComputedEventListener<Orig extends Func1, VS> =
//   Orig extends DOMeventHandler<any> ?
//     (handler: (dataContent: VS, coordinate: string) => void) => void :
//     (handler: (evt: Parameters<Orig>[0], dataContent: VS, coordinate: string) => void) => void;
//
// interface JayNativeEventBuilder<ViewState, EventData> {
//   then(handler: (eventData: EventData, viewState: ViewState, coordinate: string) => void): void
// }
//
// // create a function type that given a function event handler,
// // creates a new type which
// // - if the original function is a DOM event handler, creates a function that accepts an event handler,
// //   which in turn the native event and ViewState, and returns a value T
// // - for component functions, we return null as native events are not supported or needed
// // - the returned function (handler registration function) returns a JayNativeEventBuilder which accepts another handler
// //   for the regular event handler
// type JayComputedNativeEventListener<Orig extends Func1, VS> =
//   Orig extends DOMeventHandler<any> ?
//     <T>(handler: (e: Parameters<Orig>[0], dataContent: VS, coordinate: string) => T) => JayNativeEventBuilder<VS, T> :
//     null;
// // creates a type that has only the event handlers or the original object,
// // adding the ViewState param to each event handler function type.
// type JayEventHandlersOf<ViewState, Element> = {
//   [Property in keyof EventHandlersOf<Element>]: JayComputedEventListener<EventHandlersOf<Element>[Property], ViewState>;
// }
// type JayNativeEventHandlersOf<ViewState, Element> = {
//   [Property in keyof EventHandlersOf<Element> as `$${Property}`]: JayComputedNativeEventListener<EventHandlersOf<Element>[Property], ViewState>
// }
// export type JayEventListener<E, T> = (event: E, dataContent: T, coordinate: string) => void;
//
// export interface EventRegistrar<ViewState> {
//   addEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: boolean | AddEventListenerOptions): void
//
//   removeEventListener<E extends Event>(type: string, listener: JayEventListener<E, ViewState> | null, options?: EventListenerOptions | boolean): void
// }
//
// interface ReferenceOperations<ViewState, Element> extends EventRegistrar<ViewState> {
//   execNative<T>(handler: (elem: Element) => T): T
// }
//
// export interface DynamicReferenceOperations<ViewState, Element> extends EventRegistrar<ViewState> {
//   filter(predicate: (t: ViewState) => boolean): Element
//
//   forEach(handler: (element: Element) => void): void
// }
//
// export type DynamicReference<ViewState, Element extends ReferencedElement> =
//   JayEventHandlersOf<ViewState, Element> &
//   JayNativeEventHandlersOf<ViewState, Element> &
//   DynamicReferenceOperations<ViewState, Element>
// export type Reference<ViewState, Element extends ReferencedElement> =
//   JayEventHandlersOf<ViewState, Element> &
//   JayNativeEventHandlersOf<ViewState, Element> &
//   ReferenceOperations<ViewState, Element>


/** new model **/
/** DOM element references **/
type JeyEventHandler<ViewState> = (viewState: ViewState, coordinate: string) => void
type JayNativeEventHandler<NativeEvent, EventData, ViewState> = (ev: NativeEvent, viewState: ViewState, coordinate: string) => EventData
type JayNativeFunction<ElementType extends HTMLElement, ViewState, Result> = (elem: ElementType, viewState: ViewState) => Result
interface JayNativeEventBuilder<ViewState, EventData> {
  then(handler: (eventData: EventData, viewState: ViewState, coordinate: string) => void): void
}

export interface HTMLElementProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  onclick(handler: JeyEventHandler<ViewState>): void
  $onclick<EventData>(handler: JayNativeEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  forEach(handler: (element: ElementType, viewState: ViewState, coordinate: string) => void): void
  find(predicate: (t: ViewState) => boolean): HTMLElementProxy<ViewState, ElementType>
  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): ResultType
}

/** Components references **/

export interface ComponentEventDefinition<EventType> {
  (handler: (event: EventType) => void)
  handler?: (event: EventType) => void
}

type ComponentEventDefinitionKeys<T extends JayComponent<any, any, any>> = {
  [P in keyof T]:
  P extends string ?
    (T[P] extends ComponentEventDefinition<any> ? P : never) :
    never
}[keyof T];

type EventDefinedByComponent<T  extends JayComponent<any, any, any>> = {
  [Q in ComponentEventDefinitionKeys<T>]: T[Q]
};

type EventExportedByComponent<EventType, Orig extends ComponentEventDefinition<EventType>, VS> =
    (handler: (evt: Parameters<Parameters<Orig>[0]>[0], dataContent: VS, coordinate: string) => void) => void;

type EventsExportedByComponent<ViewState, ComponentType extends JayComponent<any, ViewState, any>> = {
  [Property in keyof EventDefinedByComponent<ComponentType>]: EventExportedByComponent<any, EventDefinedByComponent<ComponentType>[Property], ViewState>
}

export interface ComponentProxyOperations<ViewState, ComponentType extends JayComponent<any, ViewState, any>> {
  forEach(handler: (comp: ComponentType, viewState: ViewState, coordinate: string) => void): void
  find(predicate: (t: ViewState) => boolean): ComponentType
}

export type ComponentProxy<ViewState, ComponentType extends JayComponent<any, ViewState, any>> =
  ComponentProxyOperations<ViewState, ComponentType> &
  EventsExportedByComponent<ViewState, ComponentType>