import type { JayComponent } from '@jay-framework/runtime';
import { deepMergeViewStates, type TrackByMap } from '@jay-framework/view-state-merge';
import { collectInteractions } from './interaction-collector';
import { groupInteractions } from './group-interactions';
import type {
    AutomationAPI,
    PageState,
    Interaction,
    InteractionInstance,
    CollectedInteraction,
    Coordinate,
} from './types';

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
    private cachedRaw: CollectedInteraction[] | null = null;
    private cachedGrouped: Interaction[] | null = null;
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
            this.initialSlowViewState = options.initialViewState;
            this.trackByMap = options.trackByMap;
        }
        this.subscribeToUpdates();
    }

    private subscribeToUpdates(): void {
        // Use addEventListener with 'viewStateChange' event
        this.viewStateHandler = () => {
            this.cachedRaw = null;
            this.cachedGrouped = null;
            // Update merged state if we're tracking slow ViewState
            // Clear cached merged state — getPageState() recomputes it fresh
            // to pick up lazy __headlessInstances from nested components (DL#128).
            this.mergedViewState = null;
            this.notifyListeners();
        };
        this.component.addEventListener(VIEW_STATE_CHANGE, this.viewStateHandler);
    }

    private notifyListeners(): void {
        if (this.stateListeners.size === 0) return;
        const state = this.getPageState();
        this.stateListeners.forEach((callback) => callback(state));
    }

    private getGrouped(): Interaction[] {
        if (!this.cachedGrouped) {
            if (!this.cachedRaw) {
                this.cachedRaw = collectInteractions(this.component.element?.refs);
            }
            this.cachedGrouped = groupInteractions(this.cachedRaw);
        }
        return this.cachedGrouped;
    }

    getPageState(): PageState {
        // Always read from the component's viewState getter — it lazily collects
        // non-keyed instance ViewStates via __headlessInstances (DL#128).
        // For pages with slow rendering, merge with the initial slow ViewState
        // to include slow-phase-only properties.
        let viewState: object;
        if (this.initialSlowViewState && this.trackByMap) {
            viewState = deepMergeViewStates(
                this.initialSlowViewState,
                this.component.viewState || {},
                this.trackByMap,
            );
            // Prefer the component's __headlessInstances (current interactive state)
            // over the slow-phase snapshot which may have stale values.
            const componentInstances = (this.component.viewState as any)?.__headlessInstances;
            if (componentInstances) {
                (viewState as any).__headlessInstances = componentInstances;
            }
        } else {
            viewState = this.component.viewState;
        }

        return {
            viewState,
            interactions: this.getGrouped(),
            customEvents: this.getCustomEvents(),
        };
    }

    triggerEvent(eventType: string, coordinate: Coordinate, eventData?: object): void {
        const instance = this.getInteraction(coordinate);
        if (!instance) {
            throw new Error(`No element found at coordinate: ${coordinate.join('/')}`);
        }

        const event = new Event(eventType, { bubbles: true });
        if (eventData) {
            Object.assign(event, eventData);
        }
        instance.element.dispatchEvent(event);
    }

    getInteraction(coordinate: Coordinate): InteractionInstance | undefined {
        for (const group of this.getGrouped()) {
            for (const instance of group.items) {
                if (
                    instance.coordinate.length === coordinate.length &&
                    instance.coordinate.every((c, idx) => c === coordinate[idx])
                ) {
                    return instance;
                }
            }
        }
        return undefined;
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
        this.cachedRaw = null;
        this.cachedGrouped = null;
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
