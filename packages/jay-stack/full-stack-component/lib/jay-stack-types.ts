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
    // Use Symbol.for() with a namespace prefix so that the same service name
    // always produces the same Symbol, even when Vite re-evaluates modules
    // during SSR hot reload (which would create duplicate unique Symbols).
    if (name) {
        return Symbol.for(`jay:service:${name}`) as ServiceMarker<ServiceType>;
    }
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

/**
 * Query string parameters parsed from the request URL.
 * Available in the fast phase only — not in the slow phase.
 * For repeated keys (?a=1&a=2), the last value wins.
 */
export interface RequestQuery {
    query: Record<string, string>;
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
 * A tag to inject into the HTML <head> during SSR (Design Log #127).
 * Components return these from phaseOutput() to control page metadata (title, meta, link, etc.).
 * Head tags are SSR-only — not hydrated on the client.
 */
export interface HeadTag {
    /** Element name, e.g. 'title', 'meta', 'link' */
    tag: string;
    /** HTML attributes, e.g. { name: 'description', content: '...' } */
    attrs?: Record<string, string>;
    /** Text content, e.g. 'My Page Title' for <title> */
    children?: string;
}

/**
 * Successful output of a rendering phase.
 * Contains the rendered ViewState and data to carry forward to the next phase.
 */
export interface PhaseOutput<ViewState extends object, CarryForward = {}> {
    kind: 'PhaseOutput';
    rendered: ViewState;
    carryForward: CarryForward;
    /** Tags to inject into <head> during SSR (Design Log #127). */
    headTags?: HeadTag[];
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
    props: PropsT & RequestQuery,
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
    /** Client-side defaults for when server fast ViewState is not available
     *  (e.g., new forEach items created on the client). Client-only. */
    clientDefaults?: (props: PropsT) => { viewState: FastVS; carryForward?: any };
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
    /** Contract name (PascalCase, e.g., "BlogPostsList"). Optional for single-contract generators — omit to use the prefix as the contract name. */
    name?: string;
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
