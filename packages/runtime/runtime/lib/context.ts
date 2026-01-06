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
    constructor(
        private readonly data: ViewState,
        public readonly forStaticElements: boolean = true,
        private readonly coordinateBase: Coordinate = [],
    ) {}

    get currData() {
        return this.data;
    }

    coordinate = (refName: string): Coordinate => {
        return [...this.coordinateBase, refName];
    };

    forItem<ChildViewState>(childViewState: ChildViewState, id: string) {
        return new ConstructContext(childViewState, false, [...this.coordinateBase, id]);
    }
    forAsync<ChildViewState>(childViewState: ChildViewState) {
        return new ConstructContext(childViewState, false, [...this.coordinateBase]);
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
}
