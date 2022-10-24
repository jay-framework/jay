import {JayComponent, JayEventHandler} from "./element-types";

/** new model **/
/** DOM element references **/
export type JeyEventHandler<ViewState> = (viewState: ViewState, coordinate: string) => void
type JayNativeFunction<ElementType extends HTMLElement, ViewState, Result> = (elem: ElementType, viewState: ViewState) => Result
interface JayNativeEventBuilder<ViewState, EventData> {
  then(handler: (eventData: EventData, viewState: ViewState, coordinate: string) => void): void
}

export interface HTMLElementCollectionProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)
  onclick(handler: JayEventHandler<void, ViewState, void>): void
  $onclick<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  find(predicate: (t: ViewState) => boolean): HTMLElementProxy<ViewState, ElementType>
  map<ResultType>(handler: (element: HTMLElementProxy<ViewState, ElementType>, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
}

export interface HTMLElementProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)
  onclick(handler: JayEventHandler<void, ViewState, void>): void
  $onclick<EventData>(handler: JayEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): ResultType
}

/** Components references **/

export interface ComponentEventDefinition<EventType, ViewState> {
  (handler: JayEventHandler<EventType, ViewState, void>)
  handler?: JayEventHandler<EventType, ViewState, void>
}

type ComponentEventDefinitionKeys<T extends JayComponent<any, any, any>> = {
  [P in keyof T]:
  P extends string ?
    (T[P] extends ComponentEventDefinition<any, any> ? P : never) :
    never
}[keyof T];

type EventDefinedByComponent<T  extends JayComponent<any, any, any>> = {
  [Q in ComponentEventDefinitionKeys<T>]: T[Q]
};

type EventExportedByComponent<EventType, Orig extends ComponentEventDefinition<EventType, VS>, VS> =
    (handler: (evt: Parameters<Parameters<Orig>[0]>[0], dataContent: VS, coordinate: string) => void) => void;

type EventsExportedByComponent<ViewState, ComponentType extends JayComponent<any, ViewState, any>> = {
  [Property in keyof EventDefinedByComponent<ComponentType>]: EventExportedByComponent<any, EventDefinedByComponent<ComponentType>[Property], ViewState>
}

export interface ComponentCollectionProxyOperations<ViewState, ComponentType extends JayComponent<any, ViewState, any>> {
  addEventListener(type: string, handler: JayEventHandler<any, ViewState, void>)
  removeEventListener(type: string, handler: JayEventHandler<any, ViewState, void>)

  map<ResultType>(handler: (comp: ComponentType, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
  find(predicate: (t: ViewState) => boolean): ComponentType
}

export type ComponentCollectionProxy<ViewState, ComponentType extends JayComponent<any, any, any>> =
  ComponentCollectionProxyOperations<ViewState, ComponentType> &
  EventsExportedByComponent<ViewState, ComponentType>