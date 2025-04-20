import { ComponentConstructor, ContextMarkers, JayComponentCore } from 'jay-component';
import { JayElement, PreRenderElement } from 'jay-runtime';

export interface PageProps {
    language: string;
}

export type UrlParams = Record<string, string>;

export interface ServerError5xx {
    kind: 'ServerError';
    status: number;
}

export interface ClientError4xx {
    kind: 'ClientError';
    status: number;
}

export interface Redirect3xx {
    kind: 'redirect';
    status: number;
    location: string;
}

export interface PartialRender<ViewState extends object, CarryForward> {
    kind: 'PartialRender';
    rendered: Partial<ViewState>;
    carryForward: CarryForward;
}

export type SlowlyRenderResult<ViewState extends object, CarryForward> =
    | PartialRender<ViewState, CarryForward>
    | ServerError5xx
    | ClientError4xx;
export type AnySlowlyRenderResult = SlowlyRenderResult<object, object>;
export type FastRenderResult<ViewState extends object, CarryForward> =
    | PartialRender<ViewState, CarryForward>
    | ServerError5xx
    | ClientError4xx
    | Redirect3xx;
export type AnyFastRenderResult = FastRenderResult<object, object>;

export type LoadParams<ServerContexts, Params extends UrlParams> = (
    contexts: ServerContexts,
) => AsyncIterable<Params[]>;

export type RenderSlowly<
    ServerContexts extends Array<object>,
    PropsT extends object,
    StaticViewState extends object,
    SlowlyCarryForward,
> = (
    props: PropsT,
    ...contexts: ServerContexts
) => Promise<SlowlyRenderResult<StaticViewState, SlowlyCarryForward>>;

export type RenderFast<
    ServerContexts extends Array<object>,
    PropsT extends object,
    DynamicViewState extends object,
    FastCarryForward,
> = (
    props: PropsT,
    ...contexts: ServerContexts
) => Promise<FastRenderResult<DynamicViewState, FastCarryForward>>;

export interface JayStackComponentDefinition<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    ServerContexts extends Array<any>,
    ClientContexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> {
    // render: PreRenderElement<ViewState, Refs, JayElement<ViewState, Refs>>;
    serverContexts: ContextMarkers<ServerContexts>;
    clientContexts: ContextMarkers<ClientContexts>;
    loadParams: LoadParams<ServerContexts, Params>;
    slowlyRender: RenderSlowly<ServerContexts, PropsT, StaticViewState, any>;
    fastRender: RenderFast<
        ServerContexts,
        PropsT,
        ViewState,
        any
    >;
    comp: ComponentConstructor<PropsT, Refs, ViewState, ClientContexts, CompCore>;
}

export type AnyJayStackComponentDefinition = JayStackComponentDefinition<
    object,
    object,
    object,
    object[],
    object[],
    object,
    UrlParams,
    any
>;
