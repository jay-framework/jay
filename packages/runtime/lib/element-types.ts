export interface updateFunc<T> {
  (newData: T): void

  _origUpdates?: Array<updateFunc<T>>
}

//type updateFunc<T> = (newData:T) => void;
export type MountFunc = () => void;
export const noopUpdate: updateFunc<any> = (_newData: any): void => {
};
export const noopMount: MountFunc = (): void => {
}

export interface BaseJayElement<ViewState> {
  // dom: HTMLElement,
  update: updateFunc<ViewState>
  mount: MountFunc,
  unmount: MountFunc
}

export interface JayElement<ViewState, Refs> extends BaseJayElement<ViewState> {
  refs: Refs
}

export interface JayEvent<EventType, ViewState> {
  event: EventType,
  viewState: ViewState,
  coordinate: string
}
export type JayEventHandler<EventType, ViewState, Returns> = (event: JayEvent<EventType, ViewState>) => Returns
export interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>> {
  element: jayElement
  update: updateFunc<Props>
  mount: MountFunc,
  unmount: MountFunc,
  addEventListener: (type: string, handler: JayEventHandler<any, ViewState, void>) => void
  removeEventListener: (type: string, handler: JayEventHandler<any, ViewState, void>) => void
}

export type PropsFrom<Type> = Type extends JayComponent<infer Props, any, any>? Props : null
export type ViewStateFrom<Type> = Type extends JayComponent<any, infer ViewState, any>? ViewState : null
export type ElementFrom<Type> = Type extends JayComponent<any, any, infer Element>? Element : null

export type JayComponentConstructor<Props> = (props: Props) => JayComponent<Props, any, any>

export type RenderElement<ViewState extends object, Refs extends object, JayElementT extends JayElement<ViewState, Refs>> =
  (vs: ViewState, options?: RenderElementOptions) => JayElementT

export interface RenderElementOptions {
  eventWrapper?: JayEventHandlerWrapper<any, any, any>
}
export type JayEventHandlerWrapper<EventType, ViewState, Returns> =
  (orig: JayEventHandler<EventType, ViewState, Returns>, event: JayEvent<EventType, ViewState>) => Returns
