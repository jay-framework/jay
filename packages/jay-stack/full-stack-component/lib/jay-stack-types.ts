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

/**
 * Props passed to components that work with dynamic contracts.
 * The runtime automatically populates these when a headless component
 * is used with a dynamic contract.
 *
 * @typeParam TMetadata - The metadata type from the generator (defaults to Record<string, unknown>)
 *
 * @example
 * ```typescript
 * interface MyMetadata { collectionId: string }
 *
 * export const collectionList = makeJayStackComponent<MyContract, DynamicContractProps<MyMetadata>>()
 *   .withServices(MY_DATA_SERVICE)
 *   .withSlowlyRender(async (props, dataService) => {
 *     const { collectionId } = props.metadata!; // Typed correctly
 *     // ...
 *   });
 * ```
 */
export interface DynamicContractProps<TMetadata = Record<string, unknown>> {
    /** Contract name (e.g., "RecipesList" or "list/recipes-list") */
    contractName: string;
    /** Metadata from the generator */
    metadata?: TMetadata;
}

// ============================================================================
// Page Props and URL Params
// ============================================================================

export interface PageProps {
    language: string;
    url: string;
}

export type UrlParams = Record<string, string>;

// ============================================================================
// Render Result Types
// ============================================================================

export interface ServerError5xx {
    kind: 'ServerError';
    status: number;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
}

export interface ClientError4xx {
    kind: 'ClientError';
    status: number;
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
}

export interface Redirect3xx {
    kind: 'Redirect';
    status: number;
    location: string;
    message?: string;
}

/**
 * Successful output of a rendering phase.
 * Contains the rendered ViewState and data to carry forward to the next phase.
 */
export interface PhaseOutput<ViewState extends object, CarryForward = {}> {
    kind: 'PhaseOutput';
    rendered: ViewState;
    carryForward: CarryForward;
}

/**
 * @deprecated Use PhaseOutput instead. PartialRender is kept for backwards compatibility.
 */
export type PartialRender<ViewState extends object, CarryForward> = PhaseOutput<
    ViewState,
    CarryForward
>;

/**
 * Union of all possible render outcomes.
 */
export type RenderOutcome<ViewState extends object, CarryForward = {}> =
    | PhaseOutput<ViewState, CarryForward>
    | ServerError5xx
    | ClientError4xx
    | Redirect3xx;

export type SlowlyRenderResult<ViewState extends object, CarryForward = {}> = RenderOutcome<
    ViewState,
    CarryForward
>;
export type AnySlowlyRenderResult = SlowlyRenderResult<object, object>;

export type FastRenderResult<ViewState extends object, CarryForward = {}> = RenderOutcome<
    ViewState,
    CarryForward
>;
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

// ============================================================================
// Dynamic Contract Generator API
// ============================================================================

/**
 * A generated contract definition in YAML string format.
 *
 * This avoids dependency on compiler types - generators output contract YAML,
 * which the compiler parses using its own type system.
 *
 * @example
 * ```typescript
 * return {
 *   name: 'RecipesList',
 *   yaml: buildContractYaml(schema),
 *   description: 'List page for recipes',
 *   metadata: { collectionId: 'Recipes' }, // Passed to component via props.metadata
 * };
 * ```
 */
export interface GeneratedContractYaml {
    /** Contract name (PascalCase, e.g., "BlogPostsList") */
    name: string;
    /** Contract definition in YAML format */
    yaml: string;
    /** Optional description for the contract */
    description?: string;
    /** Optional metadata passed to component via DynamicContractProps.metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Function that generates contracts dynamically at build time.
 * Returns contract definitions as YAML strings to avoid compiler type dependencies.
 * Services are injected based on the markers provided to withServices().
 */
export type ContractGeneratorFunction<Services extends any[]> = (
    ...services: Services
) => Promise<GeneratedContractYaml[]> | GeneratedContractYaml[];

/**
 * Interface for a dynamic contract generator with service dependencies.
 * Returned by makeContractGenerator() builder.
 */
export interface DynamicContractGenerator<Services extends any[] = any[]> {
    services: ServiceMarkers<Services>;
    generate: ContractGeneratorFunction<Services>;
}

/**
 * Type helper to extract service instances from service markers.
 */
export type ServiceInstances<Markers extends ServiceMarkers<any[]>> =
    Markers extends ServiceMarkers<infer Services> ? Services : never;
