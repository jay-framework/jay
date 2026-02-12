import { describe, it, expect, vi } from 'vitest';
import { wrapWithAutomation } from '../lib';

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
        eventListeners['viewStateChange']?.({
            event: newState,
            viewState: newState,
            coordinate: [],
        });
    };

    return component;
}

describe('runtime-automation', () => {
    describe('wrapWithAutomation', () => {
        it('should add automation property to component', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            expect(wrapped.automation).toBeDefined();
            expect(wrapped.automation.getPageState).toBeInstanceOf(Function);
            expect(wrapped.automation.triggerEvent).toBeInstanceOf(Function);
            expect(wrapped.automation.onStateChange).toBeInstanceOf(Function);
        });

        it('should preserve original component properties', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            expect(wrapped.element).toBe(component.element);
            expect(wrapped.update).toBe(component.update);
        });

        it('should subscribe to viewStateChange event', () => {
            const component = createMockComponent();
            wrapWithAutomation(component);

            expect(component.addEventListener).toHaveBeenCalledWith(
                'viewStateChange',
                expect.any(Function),
            );
        });
    });

    describe('AutomationAPI.getPageState', () => {
        it('should return current ViewState', () => {
            const component = createMockComponent({ count: 42, name: 'test' });
            const wrapped = wrapWithAutomation(component);

            const state = wrapped.automation.getPageState();

            expect(state.viewState).toEqual({ count: 42, name: 'test' });
        });

        it('should return grouped Interactions from refs', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            const state = wrapped.automation.getPageState();

            expect(state.interactions.length).toBe(2);
            expect(state.interactions[0].refName).toBe('incrementBtn');
            expect(state.interactions[0].items).toHaveLength(1);
            expect(state.interactions[0].items[0].coordinate).toEqual(['incrementBtn']);
            expect(state.interactions[0].items[0].element).toBeInstanceOf(HTMLButtonElement);
            expect(state.interactions[0].items[0].events).toEqual(['click']);
            expect(state.interactions[1].refName).toBe('decrementBtn');
        });
    });

    describe('AutomationAPI.getInteraction', () => {
        it('should find InteractionInstance by coordinate', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            const instance = wrapped.automation.getInteraction(['incrementBtn']);

            expect(instance).toBeDefined();
            expect(instance!.coordinate).toEqual(['incrementBtn']);
            expect(instance!.element).toBeInstanceOf(HTMLButtonElement);
            expect(instance!.events).toEqual(['click']);
        });

        it('should return undefined for unknown coordinate', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            const instance = wrapped.automation.getInteraction(['unknownRef']);

            expect(instance).toBeUndefined();
        });
    });

    describe('AutomationAPI.triggerEvent', () => {
        it('should dispatch event on element', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            const instance = wrapped.automation.getInteraction(['incrementBtn']);
            const clickHandler = vi.fn();
            instance!.element.addEventListener('click', clickHandler);

            wrapped.automation.triggerEvent('click', ['incrementBtn']);

            expect(clickHandler).toHaveBeenCalled();
        });

        it('should throw for unknown coordinate', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            expect(() => {
                wrapped.automation.triggerEvent('click', ['unknownRef']);
            }).toThrow('No element found at coordinate: unknownRef');
        });
    });

    describe('AutomationAPI.onStateChange', () => {
        it('should notify on ViewState changes', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAutomation(component);

            const callback = vi.fn();
            wrapped.automation.onStateChange(callback);

            // Simulate state change
            component._setViewState({ count: 1 });

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0].viewState).toEqual({ count: 1 });
        });

        it('should return unsubscribe function', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAutomation(component);

            const callback = vi.fn();
            const unsubscribe = wrapped.automation.onStateChange(callback);

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

    describe('AutomationAPI.dispose', () => {
        it('should clean up event listener', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAutomation(component);

            // Dispose
            wrapped.automation.dispose();

            expect(component.removeEventListener).toHaveBeenCalledWith(
                'viewStateChange',
                expect.any(Function),
            );
        });

        it('should not notify after dispose', () => {
            const component = createMockComponent({ count: 0 });
            const wrapped = wrapWithAutomation(component);

            const callback = vi.fn();
            wrapped.automation.onStateChange(callback);

            // Dispose
            wrapped.automation.dispose();

            // Should not trigger callback after dispose
            component._setViewState({ count: 1 });
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('AutomationAPI.getCustomEvents', () => {
        it('should return list of custom events', () => {
            const component = createMockComponent();
            // Add mock event emitter
            component.onAddToCart = vi.fn();
            component.onAddToCart.emit = vi.fn();

            const wrapped = wrapWithAutomation(component);

            const events = wrapped.automation.getCustomEvents();

            expect(events).toContainEqual({ name: 'AddToCart' });
        });

        it('should return empty array if no custom events', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            const events = wrapped.automation.getCustomEvents();

            expect(events).toEqual([]);
        });
    });

    describe('AutomationAPI.onComponentEvent', () => {
        it('should subscribe to custom event', () => {
            const component = createMockComponent();
            let eventCallback: ((e: { event: any }) => void) | undefined;

            // Mock event emitter that stores the callback
            component.onAddToCart = vi.fn((cb: any) => {
                eventCallback = cb;
            });
            component.onAddToCart.emit = vi.fn();

            const wrapped = wrapWithAutomation(component);
            const callback = vi.fn();

            wrapped.automation.onComponentEvent('AddToCart', callback);

            // Simulate event emission
            eventCallback?.({ event: { productId: '123' } });

            expect(callback).toHaveBeenCalledWith({ productId: '123' });
        });

        it('should throw for unknown event', () => {
            const component = createMockComponent();
            const wrapped = wrapWithAutomation(component);

            expect(() => {
                wrapped.automation.onComponentEvent('UnknownEvent', vi.fn());
            }).toThrow('Unknown component event: UnknownEvent');
        });
    });

    describe('disabled element filtering', () => {
        it('should exclude disabled buttons from interactions', () => {
            const disabledBtn = document.createElement('button');
            disabledBtn.disabled = true;

            const enabledBtn = document.createElement('button');

            const component = createMockComponent();
            component.element.refs = {
                submitBtn: {
                    elements: new Set([
                        { element: enabledBtn, coordinate: ['submitBtn'], viewState: undefined },
                    ]),
                },
                disabledBtn: {
                    elements: new Set([
                        { element: disabledBtn, coordinate: ['disabledBtn'], viewState: undefined },
                    ]),
                },
            };

            const wrapped = wrapWithAutomation(component);
            const state = wrapped.automation.getPageState();

            expect(state.interactions.length).toBe(1);
            expect(state.interactions[0].refName).toBe('submitBtn');
        });

        it('should exclude disabled inputs from interactions', () => {
            const disabledInput = document.createElement('input');
            disabledInput.disabled = true;

            const enabledInput = document.createElement('input');

            const component = createMockComponent();
            component.element.refs = {
                nameInput: {
                    elements: new Set([
                        { element: enabledInput, coordinate: ['nameInput'], viewState: undefined },
                    ]),
                },
                disabledInput: {
                    elements: new Set([
                        {
                            element: disabledInput,
                            coordinate: ['disabledInput'],
                            viewState: undefined,
                        },
                    ]),
                },
            };

            const wrapped = wrapWithAutomation(component);
            const state = wrapped.automation.getPageState();

            expect(state.interactions.length).toBe(1);
            expect(state.interactions[0].refName).toBe('nameInput');
        });

        it('should exclude disabled forEach items but keep enabled ones', () => {
            const enabledBtn = document.createElement('button');
            const disabledBtn = document.createElement('button');
            disabledBtn.disabled = true;

            const component = createMockComponent();
            component.element.refs = {
                removeBtn: {
                    elements: new Set([
                        {
                            element: enabledBtn,
                            coordinate: ['item-1', 'removeBtn'],
                            viewState: { id: 'item-1', name: 'Mouse' },
                        },
                        {
                            element: disabledBtn,
                            coordinate: ['item-2', 'removeBtn'],
                            viewState: { id: 'item-2', name: 'Hub' },
                        },
                    ]),
                },
            };

            const wrapped = wrapWithAutomation(component);
            const state = wrapped.automation.getPageState();

            // Should have 1 group with 1 item (only the enabled one)
            expect(state.interactions.length).toBe(1);
            expect(state.interactions[0].refName).toBe('removeBtn');
            expect(state.interactions[0].items).toHaveLength(1);
            expect(state.interactions[0].items[0].coordinate).toEqual(['item-1', 'removeBtn']);
        });

        it('should exclude entire group when all instances are disabled', () => {
            const disabledBtn1 = document.createElement('button');
            disabledBtn1.disabled = true;
            const disabledBtn2 = document.createElement('button');
            disabledBtn2.disabled = true;

            const component = createMockComponent();
            component.element.refs = {
                removeBtn: {
                    elements: new Set([
                        {
                            element: disabledBtn1,
                            coordinate: ['item-1', 'removeBtn'],
                            viewState: { id: 'item-1' },
                        },
                        {
                            element: disabledBtn2,
                            coordinate: ['item-2', 'removeBtn'],
                            viewState: { id: 'item-2' },
                        },
                    ]),
                },
            };

            const wrapped = wrapWithAutomation(component);
            const state = wrapped.automation.getPageState();

            expect(state.interactions.length).toBe(0);
        });

        it('should update when disabled state changes', () => {
            const btn = document.createElement('button');

            const component = createMockComponent();
            component.element.refs = {
                myBtn: {
                    elements: new Set([
                        { element: btn, coordinate: ['myBtn'], viewState: undefined },
                    ]),
                },
            };

            const wrapped = wrapWithAutomation(component);

            // Initially enabled
            let state = wrapped.automation.getPageState();
            expect(state.interactions.length).toBe(1);

            // Disable and trigger state change to invalidate cache
            btn.disabled = true;
            component._setViewState({ count: 1 });

            state = wrapped.automation.getPageState();
            expect(state.interactions.length).toBe(0);

            // Re-enable
            btn.disabled = false;
            component._setViewState({ count: 2 });

            state = wrapped.automation.getPageState();
            expect(state.interactions.length).toBe(1);
        });
    });
});
