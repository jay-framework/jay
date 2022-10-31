import {JayComponent, JayEventHandler} from "./element-types";

/** generic **/
export type JayEventHandlerWrapper<EventType, ViewState, Returns> =
  (orig: JayEventHandler<EventType, ViewState, Returns>) => JayEventHandler<EventType, ViewState, Returns>

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

export interface EventEmitter<EventType, ViewState> {
  (handler: JayEventHandler<EventType, ViewState, void>): void
  emit(event: EventType): void
}

export interface ComponentCollectionProxyOperations<ViewState, ComponentType extends JayComponent<any, ViewState, any>> {
  addEventListener(type: string, handler: JayEventHandler<any, ViewState, void>): void
  removeEventListener(type: string, handler: JayEventHandler<any, ViewState, void>): void

  map<ResultType>(handler: (comp: ComponentType, viewState: ViewState, coordinate: string) => ResultType): Array<ResultType>
  find(predicate: (t: ViewState) => boolean): ComponentType
}

export type ComponentCollectionProxy<ViewState, ComponentType extends JayComponent<any, any, any>> =
  ComponentCollectionProxyOperations<ViewState, ComponentType>