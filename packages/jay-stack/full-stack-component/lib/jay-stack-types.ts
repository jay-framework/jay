import { ComponentConstructor, ContextMarkers, JayComponentCore } from '@jay-framework/component';

// ============================================================================
// Service Marker (for server-side dependency injection)
// ============================================================================

/**
 * A type-safe marker for identifying a service.
 * Similar to ContextMarker but for server-side services.
 */
export interface ServiceMarker<ServiceType> {}

/**
 * Creates a service marker used to register and retrieve services.
 *
 * @param name - Optional name for the service (used in error messages)
 *
 * @example
 * ```typescript
 * export interface DatabaseService {
 *   query<T>(sql: string): Promise<T[]>;
 * }
 *
 * export const DATABASE_SERVICE = createJayService<DatabaseService>('DatabaseService');
 * ```
 */
export function createJayService<ServiceType = unknown>(name?: string): ServiceMarker<ServiceType> {
    return Symbol(name) as ServiceMarker<ServiceType>;
}

/**
 * Type helper for extracting service types from an array of markers.
 */
export type ServiceMarkers<T extends any[]> = {
    [K in keyof T]: ServiceMarker<T[K]>;
};

// ============================================================================
// Page Props and URL Params
// ============================================================================

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
    SlowViewState extends object,
    SlowlyCarryForward,
> = (
    props: PropsT,
    ...services: Services
) => Promise<SlowlyRenderResult<SlowViewState, SlowlyCarryForward>>;

export type RenderFast<
    Services extends Array<object>,
    PropsT extends object,
    FastViewState extends object,
    FastCarryForward,
> = (
    props: PropsT,
    ...services: Services
) => Promise<FastRenderResult<FastViewState, FastCarryForward>>;

export interface JayStackComponentDefinition<
    Refs extends object,
    SlowVS extends object,
    FastVS extends object,
    InteractiveVS extends object,
    Services extends Array<any>,
    Contexts extends Array<any>,
    PropsT extends object,
    Params extends UrlParams,
    CompCore extends JayComponentCore<PropsT, InteractiveVS>,
> {
    // render: PreRenderElement<ViewState, Refs, JayElement<ViewState, Refs>>;
    services: ServiceMarkers<Services>;
    contexts: ContextMarkers<Contexts>;
    loadParams: LoadParams<Services, Params>;
    slowlyRender: RenderSlowly<Services, PropsT, SlowVS, any>;
    fastRender: RenderFast<Services, PropsT, FastVS, any>;
    comp: ComponentConstructor<PropsT, Refs, InteractiveVS, Contexts, CompCore>;
}

export type AnyJayStackComponentDefinition = JayStackComponentDefinition<
    object,
    object,
    object,
    object,
    object[],
    object[],
    object,
    UrlParams,
    any
>;
