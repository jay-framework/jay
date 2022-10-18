import {JayComponent, JayComponentEventHandler} from "./element-types";

/** new model **/
/** DOM element references **/
export type JeyEventHandler<ViewState> = (viewState: ViewState, coordinate: string) => void
export type JayNativeEventHandler<NativeEvent, EventData, ViewState> = (ev: NativeEvent, viewState: ViewState, coordinate: string) => EventData
type JayNativeFunction<ElementType extends HTMLElement, ViewState, Result> = (elem: ElementType, viewState: ViewState) => Result
interface JayNativeEventBuilder<ViewState, EventData> {
  then(handler: (eventData: EventData, viewState: ViewState, coordinate: string) => void): void
}

export interface HTMLElementCollectionProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)
  onclick(handler: JeyEventHandler<ViewState>): void
  $onclick<EventData>(handler: JayNativeEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  find(predicate: (t: ViewState) => boolean): HTMLElementProxy<ViewState, ElementType>
  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): Array<ResultType>
}

export interface HTMLElementProxy<ViewState, ElementType extends HTMLElement> {
  addEventListener(type: string, handler: JeyEventHandler<ViewState>)
  removeEventListener(type: string, handler: JeyEventHandler<ViewState>)
  onclick(handler: JeyEventHandler<ViewState>): void
  $onclick<EventData>(handler: JayNativeEventHandler<MouseEvent, ViewState, EventData>): JayNativeEventBuilder<ViewState, EventData>

  $exec<ResultType>(handler: JayNativeFunction<ElementType, ViewState, ResultType>): ResultType
}

/** Components references **/

export interface ComponentEventDefinition<EventType, PropsType> {
  (handler: JayComponentEventHandler<EventType, PropsType>)
  handler?: JayComponentEventHandler<EventType, PropsType>
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
  addEventListener(type: string, handler: JayComponentEventHandler<any, ViewState>)
  removeEventListener(type: string, handler: JayComponentEventHandler<any, ViewState>)

  map<ResultType>(handler: (comp: ComponentType, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
  find(predicate: (t: ViewState) => boolean): ComponentType
}

export type ComponentCollectionProxy<ViewState, ComponentType extends JayComponent<any, ViewState, any>> =
  ComponentCollectionProxyOperations<ViewState, ComponentType> &
  EventsExportedByComponent<ViewState, ComponentType>