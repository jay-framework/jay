import { ComponentConstructor, ContextMarkers, JayComponentCore } from '@jay-framework/component';

export interface PageProps {
    language: string;
    url: string;
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
    rendered: ViewState;
    carryForward: CarryForward;
}

export type SlowlyRenderResult<ViewState extends object, CarryForward> =
    | PartialRender<ViewState, CarryForward>
    | ServerError5xx
    | ClientError4xx
    | Redirect3xx;
export type AnySlowlyRenderResult = SlowlyRenderResult<object, object>;
export type FastRenderResult<ViewState extends object, CarryForward> =
    | PartialRender<ViewState, CarryForward>
    | ServerError5xx
    | ClientError4xx
    | Redirect3xx;
export type AnyFastRenderResult = FastRenderResult<object, object>;

export type LoadParams<Services, Params extends UrlParams> = (
    contexts: Services,
) => AsyncIterable<Params[]>;

export type RenderSlowly<
    Services extends Array<object>,
    PropsT extends object,
    StaticViewState extends object,
    SlowlyCarryForward,
> = (
    props: PropsT,
    ...services: Services
) => Promise<SlowlyRenderResult<StaticViewState, SlowlyCarryForward>>;

export type RenderFast<
    Services extends Array<object>,
    PropsT extends object,
    DynamicViewState extends object,
    FastCarryForward,
> = (
    props: PropsT,
    ...services: Services
) => Promise<FastRenderResult<DynamicViewState, FastCarryForward>>;

export interface JayStackComponentDefinition<
    StaticViewState extends object,
    ViewState extends object,
    Refs extends object,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, ViewState>,
> {
    // render: PreRenderElement<ViewState, Refs, JayElement<ViewState, Refs>>;
    services: ContextMarkers<Services>;
    contexts: ContextMarkers<Contexts>;
    loadParams: LoadParams<Services, Params>;
    slowlyRender: RenderSlowly<Services, PropsT, StaticViewState, any>;
    fastRender: RenderFast<Services, PropsT, ViewState, any>;
    comp: ComponentConstructor<PropsT, Refs, ViewState, Contexts, CompCore>;
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
