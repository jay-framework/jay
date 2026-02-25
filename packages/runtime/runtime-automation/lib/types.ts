/**
 * Coordinate path identifying an element.
 * For simple elements: ['refName']
 * For forEach items: ['trackByValue', 'refName']
 * For nested forEach: ['parentTrackBy', 'childTrackBy', 'refName']
 */
export type Coordinate = string[];

/**
 * A single interactive element instance — has the DOM element and its coordinate.
 */
export interface InteractionInstance {
    /** Full coordinate path identifying this element */
    coordinate: Coordinate;

    /** The actual DOM element — can be used to read/set values or call click() */
    element: HTMLElement;

    /** Relevant events this element handles (e.g., ["click"] or ["input", "change"]) */
    events: string[];
}

/**
 * Interactions grouped by refName.
 * Each ref has one or more instances (multiple when inside a forEach).
 */
export interface Interaction {
    /** Ref name from jay-html */
    refName: string;

    /** All instances of this ref (one per forEach item, or a single entry for non-forEach) */
    items: InteractionInstance[];

    /** Human-readable description (from contract if available) */
    description?: string;
}

/**
 * Internal: raw per-element data from the interaction collector.
 * Not part of the public API — consumed by the grouping function.
 */
export interface CollectedInteraction {
    refName: string;
    coordinate: Coordinate;
    element: HTMLElement;
    supportedEvents: string[];
    description?: string;
}

/**
 * Current page state exposed for automation.
 */
export interface PageState {
    /** Current ViewState of the component (includes headless component data under their keys) */
    viewState: object;

    /** Available interactions grouped by ref name */
    interactions: Interaction[];

    /** Custom events the component can emit */
    customEvents: Array<{ name: string }>;
}

/**
 * Automation API attached to wrapped components.
 */
export interface AutomationAPI {
    /** Get current page state and available interactions (grouped by ref) */
    getPageState(): PageState;

    /** Trigger an event on an element by coordinate */
    triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void;

    /** Subscribe to ViewState changes — called on every ViewState update */
    onStateChange(callback: (state: PageState) => void): () => void;

    /** Get a specific interaction instance by coordinate (returns the DOM element) */
    getInteraction(coordinate: Coordinate): InteractionInstance | undefined;

    /** Get list of custom events the component emits */
    getCustomEvents(): Array<{ name: string }>;

    /** Subscribe to a custom component event (e.g., 'AddToCart') */
    onComponentEvent(eventName: string, callback: (eventData: any) => void): () => void;

    /** Cleanup — call when component is unmounted */
    dispose(): void;
}

// Keep old names as aliases for backward compatibility
/** @deprecated Use Interaction instead */
export type AIInteraction = Interaction;
/** @deprecated Use PageState instead */
export type AIPageState = PageState;
/** @deprecated Use AutomationAPI instead */
export type AIAgentAPI = AutomationAPI;
