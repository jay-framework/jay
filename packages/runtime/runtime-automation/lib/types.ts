/**
 * Coordinate path identifying an element.
 * For forEach items: ['trackByValue', 'refName']
 * For nested: ['parentTrackBy', 'childTrackBy', 'refName']
 */
export type Coordinate = string[];

/**
 * Represents a single interactive element on the page (raw, per-coordinate).
 * Used internally and returned by getInteraction().
 */
export interface Interaction {
    /** Ref name from jay-html */
    refName: string;

    /** Full coordinate path (for forEach items) */
    coordinate: Coordinate;

    /** The actual DOM element - can be used to read/set values or call click() */
    element: HTMLElement;

    /** HTML element type (e.g., "HTMLButtonElement") */
    elementType: string;

    /** Events this element can handle (e.g., ["click", "input"]) */
    supportedEvents: string[];

    /** For collection items: the item's ViewState */
    itemContext?: object;

    /** Human-readable description (from contract if available) */
    description?: string;
}

/**
 * Interactions grouped by refName.
 * forEach refs are collapsed into a single entry with an `items` array.
 */
export interface GroupedInteraction {
    /** Ref name from jay-html */
    ref: string;

    /** Friendly element type: "Button", "TextInput", "NumberInput", "Select", etc. */
    type: string;

    /** Events this element can handle (e.g., ["click"]) */
    events: string[];

    /** Human-readable description (from contract if available) */
    description?: string;

    /** True when this ref appears inside a forEach */
    inForEach?: true;

    /** forEach items with their trackBy ID and a human-readable label */
    items?: Array<{ id: string; label: string }>;
}

/**
 * Current page state exposed for automation.
 */
export interface PageState {
    /** Current ViewState of the component (includes headless component data under their keys) */
    viewState: object;

    /** Available interactions grouped by ref name */
    interactions: GroupedInteraction[];

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

    /** Subscribe to ViewState changes - called on every ViewState update */
    onStateChange(callback: (state: PageState) => void): () => void;

    /** Get a specific interaction by coordinate (returns raw Interaction with DOM element) */
    getInteraction(coordinate: Coordinate): Interaction | undefined;

    /** Get list of custom events the component emits */
    getCustomEvents(): Array<{ name: string }>;

    /** Subscribe to a custom component event (e.g., 'AddToCart') */
    onComponentEvent(eventName: string, callback: (eventData: any) => void): () => void;

    /** Cleanup - call when component is unmounted */
    dispose(): void;
}

// Keep old names as aliases for backward compatibility
/** @deprecated Use Interaction instead */
export type AIInteraction = Interaction;
/** @deprecated Use PageState instead */
export type AIPageState = PageState;
/** @deprecated Use AutomationAPI instead */
export type AIAgentAPI = AutomationAPI;
