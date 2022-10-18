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
  dom: HTMLElement,
  update: updateFunc<ViewState>
  mount: MountFunc,
  unmount: MountFunc
}

export interface JayElement<ViewState, Refs> extends BaseJayElement<ViewState> {
  refs: Refs
}

export type JayComponentEventHandler<EventType, PropsType> = (ev: EventType, props: PropsType, coordinate: string) => void
export interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>> {
  // element: jayElement
  update: updateFunc<Props>
  mount: MountFunc,
  unmount: MountFunc,
  addEventListener: (type: string, handler: JayComponentEventHandler<any, ViewState>) => void
  removeEventListener: (type: string, handler: JayComponentEventHandler<any, ViewState>) => void
}

