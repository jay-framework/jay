/**
 * Coordinate path identifying an element.
 * For forEach items: ['trackByValue', 'refName']
 * For nested: ['parentTrackBy', 'childTrackBy', 'refName']
 */
export type Coordinate = string[];

/**
 * Represents an interactive element on the page.
 */
export interface AIInteraction {
    /** Ref name from jay-html */
    refName: string;

    /** Full coordinate path (for forEach items) */
    coordinate: Coordinate;

    /** The actual DOM element - can be used to read/set values */
    element: Element;

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
 * Current page state exposed to AI agents.
 */
export interface AIPageState {
    /** Current ViewState of the component (includes headless component data under their keys) */
    viewState: object;

    /** All available interactions with their DOM elements */
    interactions: AIInteraction[];

    /** Custom events the component can emit */
    customEvents: Array<{ name: string }>;
}

/**
 * AI Agent API attached to wrapped components.
 */
export interface AIAgentAPI {
    /** Get current page state and available interactions */
    getPageState(): AIPageState;

    /** Trigger an event on an element by coordinate */
    triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void;

    /** Subscribe to ViewState changes - called on every ViewState update */
    onStateChange(callback: (state: AIPageState) => void): () => void;

    /** Get a specific interaction by coordinate */
    getInteraction(coordinate: Coordinate): AIInteraction | undefined;

    /** Get list of custom events the component emits */
    getCustomEvents(): Array<{ name: string }>;

    /** Subscribe to a custom component event (e.g., 'AddToCart') */
    onComponentEvent(eventName: string, callback: (eventData: any) => void): () => void;

    /** Cleanup - call when component is unmounted */
    dispose(): void;
}
