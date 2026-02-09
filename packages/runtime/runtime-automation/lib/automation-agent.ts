import type { JayComponent } from '@jay-framework/runtime';
import { deepMergeViewStates, type TrackByMap } from '@jay-framework/view-state-merge';
import { collectInteractions } from './interaction-collector';
import type { AutomationAPI, PageState, Interaction, Coordinate } from './types';

/** Event type for ViewState change notifications (matches runtime export) */
const VIEW_STATE_CHANGE = 'viewStateChange';

/**
 * Options for creating an AutomationAgent with slow ViewState support.
 */
export interface AutomationAgentOptions {
    /** The initial merged slow+fast ViewState */
    initialViewState: object;
    /** TrackByMap for deep merging arrays by their track-by keys */
    trackByMap: TrackByMap;
}

/**
 * Automation agent implementation that wraps a Jay component.
 */
class AutomationAgent implements AutomationAPI {
    private stateListeners = new Set<(state: PageState) => void>();
    private cachedInteractions: Interaction[] | null = null;
    private viewStateHandler: (() => void) | null = null;
    /**
     * When slow rendering is used, this holds the merged slow+fast ViewState.
     * Updated on each viewStateChange event with the new fast state merged in.
     */
    private mergedViewState: object | undefined;
    private initialSlowViewState: object | undefined;
    private trackByMap: TrackByMap | undefined;

    constructor(
        private component: JayComponent<any, any, any>,
        options?: AutomationAgentOptions,
    ) {
        if (options) {
            // Store the initial merged state as base for future merges
            this.initialSlowViewState = options.initialViewState;
            // Store trackByMap for deep merging
            this.trackByMap = options.trackByMap;
            // Do initial merge with current component viewState
            // (component may have computed additional properties during hydration)
            this.mergedViewState = deepMergeViewStates(
                options.initialViewState,
                this.component.viewState || {},
                options.trackByMap,
            );
        }
        this.subscribeToUpdates();
    }

    private subscribeToUpdates(): void {
        // Use addEventListener with 'viewStateChange' event
        this.viewStateHandler = () => {
            this.cachedInteractions = null; // Invalidate cache
            // Update merged state if we're tracking slow ViewState
            if (this.initialSlowViewState && this.trackByMap) {
                this.mergedViewState = deepMergeViewStates(
                    this.initialSlowViewState,
                    this.component.viewState || {},
                    this.trackByMap,
                );
            }
            this.notifyListeners();
        };
        this.component.addEventListener(VIEW_STATE_CHANGE, this.viewStateHandler);
    }

    private notifyListeners(): void {
        if (this.stateListeners.size === 0) return;
        const state = this.getPageState();
        this.stateListeners.forEach((callback) => callback(state));
    }

    getPageState(): PageState {
        if (!this.cachedInteractions) {
            this.cachedInteractions = collectInteractions(this.component.element?.refs);
        }
        return {
            // Use merged state if available (slow+fast), otherwise component's viewState
            viewState: this.mergedViewState || this.component.viewState,
            interactions: this.cachedInteractions,
            customEvents: this.getCustomEvents(),
        };
    }

    triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void {
        const interaction = this.getInteraction(coordinate);
        if (!interaction) {
            throw new Error(`No element found at coordinate: ${coordinate.join('/')}`);
        }

        const event = new Event(eventType, { bubbles: true });
        if (eventData) {
            Object.assign(event, eventData);
        }
        interaction.element.dispatchEvent(event);
    }

    getInteraction(coordinate: Coordinate): Interaction | undefined {
        const state = this.getPageState();
        return state.interactions.find(
            (i) =>
                i.coordinate.length === coordinate.length &&
                i.coordinate.every((c, idx) => c === coordinate[idx]),
        );
    }

    onStateChange(callback: (state: PageState) => void): () => void {
        this.stateListeners.add(callback);
        return () => this.stateListeners.delete(callback);
    }

    getCustomEvents(): Array<{ name: string }> {
        const events: Array<{ name: string }> = [];
        const component = this.component as any;

        for (const key in component) {
            // Event emitters have an 'emit' function
            if (component[key]?.emit && typeof component[key].emit === 'function') {
                // Convert 'onAddToCart' to 'AddToCart'
                const name = key.startsWith('on') ? key.slice(2) : key;
                events.push({ name });
            }
        }

        return events;
    }

    onComponentEvent(eventName: string, callback: (eventData: any) => void): () => void {
        const component = this.component as any;

        // Try 'onEventName' format first
        const handlerKey = eventName.startsWith('on') ? eventName : `on${eventName}`;
        const handler = component[handlerKey];

        if (!handler || typeof handler !== 'function') {
            throw new Error(`Unknown component event: ${eventName}`);
        }

        // Subscribe to the event
        handler(({ event }: { event: any }) => callback(event));

        // Return unsubscribe (set handler to undefined)
        return () => handler(undefined);
    }

    dispose(): void {
        if (this.viewStateHandler) {
            this.component.removeEventListener(VIEW_STATE_CHANGE, this.viewStateHandler);
            this.viewStateHandler = null;
        }
        this.stateListeners.clear();
        this.cachedInteractions = null;
    }
}

/** Wrapper type that adds automation capabilities to a component */
export type AutomationWrappedComponent<T> = T & { automation: AutomationAPI };

/**
 * Wraps a Jay component with automation capabilities.
 * Uses addEventListener('viewStateChange', ...) to capture all state changes.
 *
 * @param component - The Jay component to wrap
 * @param options - Optional options for slow rendering support:
 *   - initialViewState: Full ViewState (slow+fast merged)
 *   - trackByMap: Map of array paths to their track-by keys for deep merging
 *
 * @example
 * ```typescript
 * const instance = MyComponent(props);
 * const wrapped = wrapWithAutomation(instance);
 *
 * // Access automation API
 * const state = wrapped.automation.getPageState();
 * wrapped.automation.triggerEvent('click', ['button-ref']);
 * ```
 *
 * @example With slow rendering
 * ```typescript
 * const instance = MyComponent(fastViewState);
 * const fullViewState = deepMergeViewStates(slowViewState, fastViewState, trackByMap);
 * const wrapped = wrapWithAutomation(instance, { initialViewState: fullViewState, trackByMap });
 * ```
 */
export function wrapWithAutomation<T extends JayComponent<any, any, any>>(
    component: T,
    options?: AutomationAgentOptions,
): AutomationWrappedComponent<T> {
    const agent = new AutomationAgent(component, options);
    return Object.assign(component, { automation: agent });
}
