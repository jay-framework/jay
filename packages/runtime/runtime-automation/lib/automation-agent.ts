import type { JayComponent } from '@jay-framework/runtime';
import { collectInteractions } from './interaction-collector';
import type { AutomationAPI, PageState, Interaction, Coordinate } from './types';

/** Event type for ViewState change notifications (matches runtime export) */
const VIEW_STATE_CHANGE = 'viewStateChange';

/**
 * Automation agent implementation that wraps a Jay component.
 */
class AutomationAgent implements AutomationAPI {
    private stateListeners = new Set<(state: PageState) => void>();
    private cachedInteractions: Interaction[] | null = null;
    private viewStateHandler: (() => void) | null = null;

    constructor(private component: JayComponent<any, any, any>) {
        this.subscribeToUpdates();
    }

    private subscribeToUpdates(): void {
        // Use addEventListener with 'viewStateChange' event
        this.viewStateHandler = () => {
            this.cachedInteractions = null; // Invalidate cache
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
            viewState: this.component.viewState,
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
 * @example
 * ```typescript
 * const instance = MyComponent(props);
 * const wrapped = wrapWithAutomation(instance);
 *
 * // Access automation API
 * const state = wrapped.automation.getPageState();
 * wrapped.automation.triggerEvent('click', ['button-ref']);
 * ```
 */
export function wrapWithAutomation<T extends JayComponent<any, any, any>>(
    component: T,
): AutomationWrappedComponent<T> {
    const agent = new AutomationAgent(component);
    return Object.assign(component, { automation: agent });
}

// Keep old names as aliases for backward compatibility
/** @deprecated Use AutomationWrappedComponent instead */
export type AIWrappedComponent<T> = AutomationWrappedComponent<T>;
/** @deprecated Use wrapWithAutomation instead */
export const wrapWithAIAgent = wrapWithAutomation;
