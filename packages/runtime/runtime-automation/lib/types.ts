/**
 * Coordinate path identifying an element.
 * For forEach items: ['trackByValue', 'refName']
 * For nested: ['parentTrackBy', 'childTrackBy', 'refName']
 */
export type Coordinate = string[];

/**
 * Represents an interactive element on the page.
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
 * Current page state exposed for automation.
 */
export interface PageState {
    /** Current ViewState of the component (includes headless component data under their keys) */
    viewState: object;

    /** All available interactions with their DOM elements */
    interactions: Interaction[];

    /** Custom events the component can emit */
    customEvents: Array<{ name: string }>;
}

/**
 * Automation API attached to wrapped components.
 */
export interface AutomationAPI {
    /** Get current page state and available interactions */
    getPageState(): PageState;

    /** Trigger an event on an element by coordinate */
    triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void;

    /** Subscribe to ViewState changes - called on every ViewState update */
    onStateChange(callback: (state: PageState) => void): () => void;

    /** Get a specific interaction by coordinate */
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
