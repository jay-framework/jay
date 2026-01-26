import { describe, it, expect, vi } from 'vitest';
import { wrapWithAIAgent } from '../lib';

// Mock component for testing
function createMockComponent(initialViewState: object = { count: 0 }) {
    let viewState = initialViewState;
    const eventListeners: Record<string, Function | undefined> = {};

    const mockRefs = {
        incrementBtn: {
            elements: new Set([
                {
                    element: document.createElement('button'),
                    coordinate: ['incrementBtn'],
                    viewState: undefined,
                },
            ]),
        },
        decrementBtn: {
            elements: new Set([
                {
                    element: document.createElement('button'),
                    coordinate: ['decrementBtn'],
                    viewState: undefined,
                },
            ]),
        },
    };

    const component: any = {
        element: {
            dom: document.createElement('div'),
            refs: mockRefs,
            update: vi.fn(),
            mount: vi.fn(),
            unmount: vi.fn(),
        },
        update: vi.fn(),
        mount: vi.fn(),
        unmount: vi.fn(),
        addEventListener: vi.fn((type: string, handler: Function) => {
            eventListeners[type] = handler;
        }),
        removeEventListener: vi.fn((type: string) => {
            eventListeners[type] = undefined;
        }),
    };

    // Add ViewState getter
    Object.defineProperty(component, 'viewState', {
        get: () => viewState,
        enumerable: false,
    });

    // Method to simulate state change (triggers viewStateChange event)
    component._setViewState = (newState: object) => {
        viewState = newState;
        eventListeners['viewStateChange']?.({ event: newState, viewState: newState, coordinate: [] });
    };

    return component;
}

describe('runtime-ai', () => {
    describe('wrapWithAIAgent', () => {
        it('should add ai property to component', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            expect(wrapped.ai).toBeDefined();
            expect(wrapped.ai.getPageState).toBeInstanceOf(Function);
            expect(wrapped.ai.triggerEvent).toBeInstanceOf(Function);
            expect(wrapped.ai.onStateChange).toBeInstanceOf(Function);
        });

        it('should preserve original component properties', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            expect(wrapped.element).toBe(component.element);
            expect(wrapped.update).toBe(component.update);
        });

        it('should subscribe to viewStateChange event', () => {
            const component = createMockComponent();
            wrapWithAIAgent(component);

            expect(component.addEventListener).toHaveBeenCalledWith(
                'viewStateChange',
                expect.any(Function),
            );
        });
    });

    describe('AIAgentAPI.getPageState', () => {
        it('should return current ViewState', () => {
            const component = createMockComponent({ count: 42, name: 'test' });
            const wrapped = wrapWithAIAgent(component);

            const state = wrapped.ai.getPageState();

            expect(state.viewState).toEqual({ count: 42, name: 'test' });
        });

        it('should return interactions from refs', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            const state = wrapped.ai.getPageState();

            expect(state.interactions.length).toBe(2);
            expect(state.interactions[0].refName).toBe('incrementBtn');
            expect(state.interactions[0].coordinate).toEqual(['incrementBtn']);
            expect(state.interactions[1].refName).toBe('decrementBtn');
        });
    });

    describe('AIAgentAPI.getInteraction', () => {
        it('should find interaction by coordinate', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            const interaction = wrapped.ai.getInteraction(['incrementBtn']);

            expect(interaction).toBeDefined();
            expect(interaction!.refName).toBe('incrementBtn');
        });

        it('should return undefined for unknown coordinate', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            const interaction = wrapped.ai.getInteraction(['unknownRef']);

            expect(interaction).toBeUndefined();
        });
    });

    describe('AIAgentAPI.triggerEvent', () => {
        it('should dispatch event on element', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            const interaction = wrapped.ai.getInteraction(['incrementBtn']);
            const clickHandler = vi.fn();
            interaction!.element.addEventListener('click', clickHandler);

            wrapped.ai.triggerEvent('click', ['incrementBtn']);

            expect(clickHandler).toHaveBeenCalled();
        });

        it('should throw for unknown coordinate', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            expect(() => {
                wrapped.ai.triggerEvent('click', ['unknownRef']);
            }).toThrow('No element found at coordinate: unknownRef');
        });
    });

    describe('AIAgentAPI.onStateChange', () => {
        it('should notify on ViewState changes', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAIAgent(component);

            const callback = vi.fn();
            wrapped.ai.onStateChange(callback);

            // Simulate state change
            component._setViewState({ count: 1 });

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0].viewState).toEqual({ count: 1 });
        });

        it('should return unsubscribe function', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAIAgent(component);

            const callback = vi.fn();
            const unsubscribe = wrapped.ai.onStateChange(callback);

            // First change
            component._setViewState({ count: 1 });
            expect(callback).toHaveBeenCalledTimes(1);

            // Unsubscribe
            unsubscribe();

            // Second change - should not trigger callback
            component._setViewState({ count: 2 });
            expect(callback).toHaveBeenCalledTimes(1);
        });
    });

    describe('AIAgentAPI.dispose', () => {
        it('should clean up event listener', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAIAgent(component);

            // Dispose
            wrapped.ai.dispose();

            expect(component.removeEventListener).toHaveBeenCalledWith(
                'viewStateChange',
                expect.any(Function),
            );
        });

        it('should not notify after dispose', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAIAgent(component);

            const callback = vi.fn();
            wrapped.ai.onStateChange(callback);

            // Dispose
            wrapped.ai.dispose();

            // Should not trigger callback after dispose
            component._setViewState({ count: 1 });
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('AIAgentAPI.getCustomEvents', () => {
        it('should return list of custom events', () => {
            const component = createMockComponent();
            // Add mock event emitter
            component.onAddToCart = vi.fn();
            component.onAddToCart.emit = vi.fn();

            const wrapped = wrapWithAIAgent(component);

            const events = wrapped.ai.getCustomEvents();

            expect(events).toContainEqual({ name: 'AddToCart' });
        });

        it('should return empty array if no custom events', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            const events = wrapped.ai.getCustomEvents();

            expect(events).toEqual([]);
        });
    });

    describe('AIAgentAPI.onComponentEvent', () => {
        it('should subscribe to custom event', () => {
            const component = createMockComponent();
            let eventCallback: ((e: { event: any }) => void) | undefined;

            // Mock event emitter that stores the callback
            component.onAddToCart = vi.fn((cb: any) => {
                eventCallback = cb;
            });
            component.onAddToCart.emit = vi.fn();

            const wrapped = wrapWithAIAgent(component);
            const callback = vi.fn();

            wrapped.ai.onComponentEvent('AddToCart', callback);

            // Simulate event emission
            eventCallback?.({ event: { productId: '123' } });

            expect(callback).toHaveBeenCalledWith({ productId: '123' });
        });

        it('should throw for unknown event', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAIAgent(component);

            expect(() => {
                wrapped.ai.onComponentEvent('UnknownEvent', vi.fn());
            }).toThrow('Unknown component event: UnknownEvent');
        });
    });
});
