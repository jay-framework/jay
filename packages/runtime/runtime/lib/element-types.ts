export interface updateFunc<T> {
    (newData: T): void;

    _origUpdates?: Array<updateFunc<T>>;
}

//type updateFunc<T> = (newData:T) => void;
export type MountFunc = () => void;
export const noop = () => {};
export const noopUpdate: updateFunc<any> = noop;
export const noopMount: MountFunc = noop;

export interface BaseJayElement<ViewState> {
    // dom: HTMLElement, - provided by element-test-types.ts
    update: updateFunc<ViewState>;
    mount: MountFunc;
    unmount: MountFunc;
}

export interface JayElement<ViewState, Refs> extends BaseJayElement<ViewState> {
    refs: Refs;
}

export type Coordinate = string[];
export interface JayEvent<EventType, ViewState> {
    event: EventType;
    viewState: ViewState;
    coordinate: Coordinate;
}
export type JayEventHandler<EventType, ViewState, Returns> = (
    event: JayEvent<EventType, ViewState>,
) => Returns;
/** Event type for ViewState change notifications */
export const VIEW_STATE_CHANGE_EVENT = 'viewStateChange';

export interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>> {
    element: jayElement;
    update: updateFunc<Props>;
    mount: MountFunc;
    unmount: MountFunc;
    addEventListener: (type: string, handler: JayEventHandler<any, ViewState, void>) => void;
    removeEventListener: (type: string, handler: JayEventHandler<any, ViewState, void>) => void;

    /** Current ViewState (read-only) */
    readonly viewState: ViewState;
}

export type PropsFrom<Type> = Type extends JayComponent<infer Props, any, any> ? Props : null;
export type ViewStateFrom<Type> =
    Type extends JayComponent<any, infer ViewState, any> ? ViewState : null;
export type ElementFrom<Type> = Type extends JayComponent<any, any, infer Element> ? Element : null;

export type JayComponentConstructor<Props> = (props: Props) => JayComponent<Props, any, any>;

export type PreRenderElement<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
> = (options?: RenderElementOptions) => [Refs, RenderElement<ViewState, Refs, JayElementT>];

export type RenderElement<
    ViewState extends object,
    Refs extends object,
    JayElementT extends JayElement<ViewState, Refs>,
> = (vs: ViewState) => JayElementT;

export interface RenderElementOptions {
    eventWrapper?: JayEventHandlerWrapper<any, any, any>;
}
export type JayEventHandlerWrapper<EventType, ViewState, Returns> = (
    orig: JayEventHandler<EventType, ViewState, Returns>,
    event: JayEvent<EventType, ViewState>,
) => Returns;

export interface ContextMarker<ContextType> {}

declare const _jayContractBrand: unique symbol;
export type JayContract<
    ViewState extends object,
    Refs extends object,
    SlowViewState extends object = never,
    FastViewState extends object = never,
    InteractiveViewState extends object = never,
> = {
    readonly [_jayContractBrand]: {
        viewState: ViewState;
        refs: Refs;
        slowViewState: SlowViewState;
        fastViewState: FastViewState;
        interactiveViewState: InteractiveViewState;
    };
};
export type ExtractViewState<A> =
    A extends JayContract<infer ViewState, any, any, any, any> ? ViewState : never;
export type ExtractRefs<A> = A extends JayContract<any, infer Refs, any, any, any> ? Refs : never;
export type ExtractSlowViewState<A> =
    A extends JayContract<any, any, infer SlowViewState, any, any> ? SlowViewState : never;
export type ExtractFastViewState<A> =
    A extends JayContract<any, any, any, infer FastViewState, any> ? FastViewState : never;
export type ExtractInteractiveViewState<A> =
    A extends JayContract<any, any, any, any, infer InteractiveViewState>
        ? InteractiveViewState
        : never;

export enum LogType {
    ASYNC_ERROR,
    CONTEXT_NOT_FOUND,
}

export type JayLog = {
    log: (type: LogType) => void;
    error: (type: LogType, error: Error) => void;
};
export const jayLog: JayLog = {
    log: noop,
    error: noop,
};
