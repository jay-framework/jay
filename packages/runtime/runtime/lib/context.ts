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

export function createJayContext<ContextType = unknown>(): ContextMarker<ContextType> {
    return Symbol();
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

export const CONSTRUCTION_CONTEXT_MARKER = createJayContext<ConstructContext<any>>();

export function currentConstructionContext() {
    return useContext(CONSTRUCTION_CONTEXT_MARKER);
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

    constructor(
        private readonly data: ViewState,
        public readonly forStaticElements: boolean = true,
        private readonly coordinateBase: Coordinate = [],
        coordinateMap?: Map<string, Element[]>,
        rootElement?: Element,
    ) {
        this._coordinateMap = coordinateMap;
        this._rootElement = rootElement;
    }

    get currData() {
        return this.data;
    }

    /** The accumulated coordinate base (trackBy values from ancestor forEach loops) */
    get dataIds(): Coordinate {
        return this.coordinateBase;
    }

    coordinate = (refName: string): Coordinate => {
        return [...this.coordinateBase, refName];
    };

    forItem<ChildViewState>(childViewState: ChildViewState, id: string) {
        return new ConstructContext(
            childViewState,
            false,
            [...this.coordinateBase, id],
            this._coordinateMap,
            this._rootElement,
        );
    }

    /**
     * Create a child context scoped to a headless instance's coordinate prefix.
     * Extends coordinateBase with the instance segments (e.g., 'product-card:0'
     * splits into ['product-card:0']), sharing the parent's coordinateMap.
     *
     * Used by childCompHydrate to scope coordinate resolution before calling
     * the component factory.
     */
    forInstance(instanceCoordinate: string) {
        const segments = instanceCoordinate.split('/');
        return new ConstructContext(
            this.data,
            false,
            [...this.coordinateBase, ...segments],
            this._coordinateMap,
            this._rootElement,
        );
    }
    forAsync<ChildViewState>(childViewState: ChildViewState) {
        return new ConstructContext(
            childViewState,
            false,
            [...this.coordinateBase],
            this._coordinateMap,
            this._rootElement,
        );
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
     * The key is scoped by the current coordinateBase — e.g., inside a forEach
     * item with trackBy "item-1", resolveCoordinate("addBtn") looks up "item-1/addBtn".
     *
     * When multiple elements share the same coordinate (e.g., duplicate ref names),
     * each call returns the next element in document order.
     */
    resolveCoordinate(key: string): Element | undefined {
        if (!this._coordinateMap) return undefined;
        const fullKey =
            this.coordinateBase.length > 0 ? this.coordinateBase.join('/') + '/' + key : key;
        const elements = this._coordinateMap.get(fullKey);
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
        const fullKey =
            this.coordinateBase.length > 0 ? this.coordinateBase.join('/') + '/' + key : key;
        const elements = this._coordinateMap.get(fullKey);
        if (!elements || elements.length === 0) return undefined;
        return elements[0];
    }

    static withRootContext<ViewState, Refs>(
        viewState: ViewState,
        refManager: ReferencesManager,
        elementConstructor: () => BaseJayElement<ViewState>,
    ): JayElement<ViewState, Refs> {
        let context = new ConstructContext(viewState);
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
        const context = new ConstructContext(
            viewState,
            false,
            parentContext?.coordinateBase || [],
            parentContext?._coordinateMap,
            parentContext?._rootElement,
        );
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
