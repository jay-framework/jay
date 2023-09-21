import {
    BaseJayElement,
    ContextMarker,
    Coordinate,
    JayElement,
    JayEventHandlerWrapper,
    RenderElementOptions,
} from './element-types';

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

export function createJayContext<ContextType = unknown>(): ContextMarker<ContextType> {
    return Symbol();
}

export function provideContext<ContextType, Returns>(
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
    let context = useOptionalContext(marker);
    if (!context) throw new Error();
    return context as ContextType;
}

export function useOptionalContext<ContextType>(
    marker: ContextMarker<ContextType>,
): ContextType | undefined {
    let aContext = currentContext;
    while (aContext) {
        if (marker === aContext.marker) return aContext.context;
        aContext = aContext.parent;
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
    let isModified;
    baseJayElement.update = (newData: T) => {
        isModified = newData !== current;
        current = newData;
        if (isModified) update(current);
    };
    return baseJayElement;
}

export class ConstructContext<A extends Array<any>> {
    refManager: ReferencesManager;
    data: A;
    forStaticElements: boolean;

    constructor(
        data: A,
        eventWrapper?: JayEventHandlerWrapper<any, any, any>,
        dm?: ReferencesManager,
        forStaticElements: boolean = true,
    ) {
        this.data = data;
        this.refManager = dm ? dm : new ReferencesManager(eventWrapper);
        this.forStaticElements = forStaticElements;
    }

    get currData() {
        return this.data[this.data.length - 1];
    }

    coordinate = (refName: string): Coordinate => {
        return [
            ...this.data
                .slice(1)
                .map((_) => _.id)
                .reverse(),
            refName,
        ];
    };

    static acc<A extends Array<any>, B>(a: A, b: B): [...A, B] {
        return [...a, b];
    }

    forItem<T>(t: T) {
        return new ConstructContext(
            ConstructContext.acc(this.data, t),
            undefined,
            this.refManager,
            false,
        );
    }

    static withRootContext<ViewState, Refs>(
        viewState: ViewState,
        elementConstructor: () => BaseJayElement<ViewState>,
        options?: RenderElementOptions,
    ): JayElement<ViewState, Refs> {
        let context = new ConstructContext([viewState], options?.eventWrapper);
        let element = provideContext(CONSTRUCTION_CONTEXT_MARKER, context, () =>
            wrapWithModifiedCheck(currentConstructionContext().currData, elementConstructor()),
        );
        element.mount();
        return context.refManager.applyToElement(element);
    }
}
