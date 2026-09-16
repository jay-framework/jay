import { BaseJayElement, ContextMarker, Coordinate, JayElement } from './element-types';

import { ReferencesManager } from './references-manager';

let currentContext: ContextStack<any> = undefined;
interface ContextStack<ContextType> {
    context: ContextType;
    marker: ContextMarker<ContextType>;
    parent?: ContextStack<any>;
}
function NewContextStack<ContextType>(
    context: ContextType,
    marker: ContextMarker<ContextType>,
    parent?: ContextStack<ContextType>,
) {
    return { context, marker, parent };
}

// ============================================================================
// Global Context Registry
// ============================================================================

/**
 * Global contexts are registered at application startup (before component tree)
 * and available to all components via useContext().
 *
 * Used by makeJayInit().withClient() to register app-wide contexts with server config.
 */
const globalContextRegistry = new Map<symbol, any>();

/**
 * Registers a global context that will be available to all components.
 * Global contexts are checked after the context stack, so component-provided
 * contexts can override global ones.
 *
 * @param marker - The context marker created with createJayContext()
 * @param context - The context value to register
 *
 * @example
 * ```typescript
 * // In lib/init.ts (using makeJayInit pattern)
 * export const init = makeJayInit()
 *   .withServer(() => ({ itemsPerPage: 10 }))
 *   .withClient((serverData) => {
 *     registerGlobalContext(APP_CONFIG_CONTEXT, serverData);
 *   });
 * ```
 */
export function registerGlobalContext<ContextType>(
    marker: ContextMarker<ContextType>,
    context: ContextType,
): void {
    globalContextRegistry.set(marker as symbol, context);
}

/**
 * Clears all registered global contexts.
 * Internal API for testing and hot reload.
 */
export function clearGlobalContextRegistry(): void {
    globalContextRegistry.clear();
}

/**
 * Gets a global context by marker.
 * Internal API used by findContext.
 */
export function useGlobalContext<ContextType>(
    marker: ContextMarker<ContextType>,
): ContextType | undefined {
    return globalContextRegistry.get(marker as symbol);
}

export function createJayContext<ContextType = unknown>(name: string): ContextMarker<ContextType> {
    return Symbol.for('jay:' + name);
}

export function withContext<ContextType, Returns>(
    marker: ContextMarker<ContextType>,
    context: ContextType,
    callback: () => Returns,
): Returns {
    let aContext = NewContextStack(context, marker, currentContext);
    try {
        currentContext = aContext;
        return callback();
    } finally {
        currentContext = aContext.parent;
    }
}

export function useContext<ContextType>(marker: ContextMarker<ContextType>): ContextType {
    let context = findContext((_) => _ === marker);
    if (!context) throw new Error();
    return context as ContextType;
}

export function findContext<ContextType>(
    predicate: (marker: ContextMarker<ContextType>) => boolean,
): ContextType | undefined {
    // First, check the context stack (component-provided contexts)
    let aContext = currentContext;
    while (aContext) {
        if (predicate(aContext.marker)) return aContext.context;
        aContext = aContext.parent;
    }

    // Fallback: check global context registry
    // This allows registerGlobalContext to work as a default
    for (const [marker, context] of globalContextRegistry.entries()) {
        if (predicate(marker as ContextMarker<ContextType>)) {
            return context as ContextType;
        }
    }

    return undefined;
}

export function saveContext() {
    return currentContext;
}

export function restoreContext<Returns>(
    savedContext: ContextStack<any>,
    callback: () => Returns,
): Returns {
    let aContext = currentContext;
    try {
        currentContext = savedContext;
        return callback();
    } finally {
        currentContext = aContext;
    }
}

export const CONSTRUCTION_CONTEXT_MARKER = createJayContext<ConstructContext<any>>('ccm');

export function currentConstructionContext() {
    return useContext(CONSTRUCTION_CONTEXT_MARKER);
}

/**
 * DL#193 Phase 2a: the synthetic parent context a component's root should adopt, handed off
 * out-of-band because the generated render signature `(viewState) => withRootContext(...)` has
 * no slot to thread it. {@link makeJayComponent} wraps its first render in
 * {@link withSyntheticParentContext} seeding this; {@link ConstructContext.withRootContext}
 * (and the hydration analog) *consume* it — clearing it immediately so nested `childComp` roots
 * built during the same render do not inherit it. Mirrors the {@link withContext} stack pattern.
 */
let pendingSyntheticParent: ConstructContext<any> | undefined = undefined;

export function withSyntheticParentContext<Returns>(
    parent: ConstructContext<any> | undefined,
    callback: () => Returns,
): Returns {
    const prev = pendingSyntheticParent;
    pendingSyntheticParent = parent;
    try {
        return callback();
    } finally {
        pendingSyntheticParent = prev;
    }
}

function consumePendingSyntheticParent(): ConstructContext<any> | undefined {
    const parent = pendingSyntheticParent;
    pendingSyntheticParent = undefined;
    return parent;
}

/**
 * Collect the live data of a context's ancestor scopes, nearest-first (DL#193,
 * Capability A). Leaf binding helpers spread this into the binding closure as the
 * extra params the compiler emits for `$parent` accessors, e.g. `dt((vs, p) => p.x)`
 * (grandparent → `(vs, p1, p2) => p2.x`). Reads `parent.currData` live because the
 * scope-switch updates mutate the captured context objects in place.
 */
export function parentDataChain(context: ConstructContext<any> | undefined): any[] {
    const chain: any[] = [];
    let p = context?.parent;
    while (p) {
        chain.push(p.currData);
        p = p.parent;
    }
    return chain;
}

export function wrapWithModifiedCheck<T extends object>(
    initialData: T,
    baseJayElement: BaseJayElement<T>,
): BaseJayElement<T> {
    let update = baseJayElement.update;
    let current = initialData;
    baseJayElement.update = (newData: T) => {
        let isModified = newData !== current;
        current = newData;
        if (isModified) update(current);
    };
    return baseJayElement;
}

export class ConstructContext<ViewState> {
    private readonly _coordinateMap?: Map<string, Element[]>;
    private readonly _rootElement?: Element;
    private readonly _dataIds: Coordinate;
    readonly sanitizeHtml?: (html: string) => string;

    /**
     * Back-pointer to the enclosing scope's context (DL#193, Capability A).
     * Set for data-scope switches (`forItem`/`forAsync`); undefined at component
     * boundaries (root / hydration-child contexts), which is what keeps `$parent`
     * from reaching across a component boundary (DL#84 isolation preserved).
     */
    parent?: ConstructContext<any>;

    /**
     * DL#193: a `forScope` child is a DOM-subtree decorator over the *same* data as its
     * source — not a data-scope switch. Rather than snapshot the source's data (which would
     * go stale when the source updates in place), it reads the source's `currData` live. This
     * keeps `$parent` chains that pass through a forScope (e.g. hydrated forEach items) fresh.
     */
    private _liveDataSource?: ConstructContext<any>;

    constructor(
        private data: ViewState,
        public readonly forStaticElements: boolean = true,
        private readonly coordinateBase: Coordinate = [],
        coordinateMap?: Map<string, Element[]>,
        rootElement?: Element,
        dataIds?: Coordinate,
        sanitizeHtml?: (html: string) => string,
    ) {
        this._coordinateMap = coordinateMap;
        this._rootElement = rootElement;
        this._dataIds = dataIds ?? coordinateBase;
        this.sanitizeHtml = sanitizeHtml;
    }

    get currData() {
        return this._liveDataSource ? this._liveDataSource.currData : this.data;
    }

    /**
     * Make this context live (DL#193, Q7): the scope-switch update writes its own
     * context in place each cascade, so leaf helpers that captured this context (and
     * children that captured it as their `.parent`) read fresh data via `currData`.
     */
    update(newData: ViewState) {
        this.data = newData;
    }

    /** The accumulated trackBy values from ancestor forEach loops (for __headlessInstances key lookup) */
    get dataIds(): Coordinate {
        return this._dataIds;
    }

    coordinate = (refName: string): Coordinate => {
        return [...this.coordinateBase, refName];
    };

    /**
     * Create a child context for a forEach item.
     *
     * With scoped coordinates (DL#126), coordinateBase is NOT accumulated —
     * scoped coordinates are fully qualified within each scope. Only dataIds
     * accumulates (for __headlessInstances key lookup).
     *
     * coordinateBase is still maintained for the non-hydration path where
     * coordinate() is used for refs.
     */
    forItem<ChildViewState>(childViewState: ChildViewState, id: string) {
        const child = new ConstructContext(
            childViewState,
            false,
            [...this.coordinateBase, id],
            this._coordinateMap,
            this._rootElement,
            [...this._dataIds, id],
            this.sanitizeHtml,
        );
        child.parent = this;
        return child;
    }
    /**
     * Create a child context scoped to a DOM subtree (DL#126).
     *
     * Builds a LOCAL coordinate map from the scope root element's subtree.
     * All coordinate lookups within this scope search the local map only.
     * This ensures forEach items with shared scope IDs resolve correctly —
     * each item builds its own local map from its own DOM branch.
     */
    forScope(scopeRootElement: Element) {
        const localMap = buildCoordinateMap(scopeRootElement);
        const child = new ConstructContext(
            this.data,
            false,
            this.coordinateBase,
            localMap,
            scopeRootElement,
            this._dataIds,
            this.sanitizeHtml,
        );
        // forScope is a DOM-subtree scope over the *same* data, not a data-scope
        // switch — make it transparent to `$parent` by passing the chain through.
        child.parent = this.parent;
        // Read the source's data live so a parent-in-place update (DL#193) is visible to
        // `$parent` leaves whose chain runs through this forScope decorator.
        child._liveDataSource = this;
        return child;
    }

    forAsync<ChildViewState>(childViewState: ChildViewState) {
        const child = new ConstructContext(
            childViewState,
            false,
            [...this.coordinateBase],
            this._coordinateMap,
            this._rootElement,
            this._dataIds,
            this.sanitizeHtml,
        );
        child.parent = this;
        return child;
    }

    /** Whether this context is in hydration mode (adopting existing DOM). */
    get isHydrating(): boolean {
        return this._coordinateMap !== undefined;
    }

    /** The root element being hydrated (undefined in non-hydration mode). */
    get rootElement(): Element | undefined {
        return this._rootElement;
    }

    /**
     * Resolve an element by its coordinate key from the hydration map.
     *
     * With scoped coordinates (DL#126), the key is fully qualified within the
     * scope (e.g., "S2/0"). No coordinateBase prefix is applied — coordinates
     * are self-contained within their scope.
     *
     * When multiple elements share the same coordinate (e.g., forEach items
     * sharing the same template scope IDs), each call returns the next element
     * in document order.
     */
    resolveCoordinate(key: string): Element | undefined {
        if (!this._coordinateMap) return undefined;
        const elements = this._coordinateMap.get(key);
        if (!elements || elements.length === 0) return undefined;
        return elements.shift();
    }

    /**
     * Peek at an element by its coordinate key without consuming it.
     * Used by hydrateForEach to resolve the container element — the same element
     * is also consumed by the parent adoptElement call (which evaluates after
     * hydrateForEach due to JavaScript argument evaluation order).
     */
    peekCoordinate(key: string): Element | undefined {
        if (!this._coordinateMap) return undefined;
        const elements = this._coordinateMap.get(key);
        if (!elements || elements.length === 0) return undefined;
        return elements[0];
    }

    static withRootContext<ViewState, Refs>(
        viewState: ViewState,
        refManager: ReferencesManager,
        elementConstructor: () => BaseJayElement<ViewState>,
        sanitizeHtml?: (html: string) => string,
    ): JayElement<ViewState, Refs> {
        const syntheticParent = consumePendingSyntheticParent();
        let context = new ConstructContext(
            viewState,
            true,
            [],
            undefined,
            undefined,
            undefined,
            sanitizeHtml,
        );
        // DL#193 Phase 2a: adopt the synthetic parent so the root's `$parent` (`_p1`) leaves
        // resolve against the outer scope via `parentDataChain`. The page root stays parent-less
        // (DL#84 isolation) — only override instances receive a synthetic parent.
        if (syntheticParent) context.parent = syntheticParent;
        let element = withContext(CONSTRUCTION_CONTEXT_MARKER, context, () =>
            wrapWithModifiedCheck(currentConstructionContext().currData, elementConstructor()),
        );
        element.mount();
        return refManager.applyToElement(element);
    }

    /**
     * Hydrate a child component's inline template within the parent's coordinate scope.
     *
     * Like withRootContext, but inherits the coordinateBase and coordinateMap from
     * the current (parent) ConstructContext. This allows adoptElement/adoptText calls
     * inside the child to resolve coordinates scoped to the child's prefix.
     *
     * Used by headless component instances during hydration: the parent pushes a
     * scoped context (via childCompHydrate), and the child's preRender calls this
     * method which inherits the scoped coordinateBase.
     */
    static withHydrationChildContext<ViewState, Refs>(
        viewState: ViewState,
        refManager: ReferencesManager,
        elementConstructor: () => BaseJayElement<ViewState>,
    ): JayElement<ViewState, Refs> {
        const parentContext = currentConstructionContext();
        const syntheticParent = consumePendingSyntheticParent();
        const context = new ConstructContext(
            viewState,
            false,
            parentContext?.coordinateBase || [],
            parentContext?._coordinateMap,
            parentContext?._rootElement,
        );
        // DL#193 Phase 2a: same synthetic-parent adoption as withRootContext, for the hydration path.
        if (syntheticParent) context.parent = syntheticParent;
        const element = withContext(CONSTRUCTION_CONTEXT_MARKER, context, () =>
            wrapWithModifiedCheck(currentConstructionContext().currData, elementConstructor()),
        );
        element.mount();
        return refManager.applyToElement(element);
    }

    /**
     * Hydrate existing server-rendered DOM.
     *
     * Builds a coordinate→element map from all [jay-coordinate] attributes
     * inside rootElement, creates a ConstructContext in hydration mode,
     * pushes it onto the context stack, then calls hydrateConstructor.
     *
     * The hydrateConstructor calls adoptText(), adoptElement(), etc. which
     * read from the context stack — same pattern as element(), dynamicText().
     * It returns a BaseJayElement whose update/mount/unmount are composed
     * from all adopted children — same as withRootContext's elementConstructor.
     */
    static withHydrationRootContext<ViewState, Refs>(
        viewState: ViewState,
        refManager: ReferencesManager,
        rootElement: Element,
        hydrateConstructor: () => BaseJayElement<ViewState>,
    ): JayElement<ViewState, Refs> {
        const coordinateMap = buildCoordinateMap(rootElement);
        const context = new ConstructContext(viewState, true, [], coordinateMap, rootElement);

        const element = withContext(CONSTRUCTION_CONTEXT_MARKER, context, () => {
            const constructed = hydrateConstructor();
            return wrapWithModifiedCheck(currentConstructionContext().currData, {
                ...constructed,
                dom: rootElement,
            });
        });
        element.mount();
        return refManager.applyToElement(element);
    }
}

/**
 * Build a coordinate → element[] map by querying all [jay-coordinate] elements
 * inside the given root. This is called once during hydration setup.
 *
 * Elements are stored in document order. When multiple elements share the same
 * coordinate (e.g., duplicate ref names), resolveCoordinate() returns them
 * one at a time in order, preventing duplicate event handler binding.
 */
function buildCoordinateMap(root: Element): Map<string, Element[]> {
    const map = new Map<string, Element[]>();
    const addToMap = (key: string, el: Element) => {
        const arr = map.get(key);
        if (arr) arr.push(el);
        else map.set(key, [el]);
    };
    // Include the root element itself if it has a coordinate
    const rootKey = root.getAttribute('jay-coordinate');
    if (rootKey) addToMap(rootKey, root);
    // Include all descendants with coordinates (in document order)
    const elements = root.querySelectorAll('[jay-coordinate]');
    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const key = el.getAttribute('jay-coordinate');
        if (key) addToMap(key, el);
    }
    return map;
}
