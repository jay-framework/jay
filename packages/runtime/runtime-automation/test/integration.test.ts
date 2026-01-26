import { describe, it, expect, vi } from 'vitest';
import {
    ConstructContext,
    element as e,
    dynamicElement as de,
    dynamicText as dt,
    forEach,
    ReferencesManager,
    JayElement,
    HTMLElementProxy,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';
import { makeJayComponent, Props, createSignal } from '@jay-framework/component';
import { wrapWithAutomation } from '../lib';

describe('AI Agent Integration Tests', () => {
    describe('Simple Counter Component', () => {
        // Define types
        interface CounterViewState {
            count: number;
            label: string;
        }
        interface CounterRefs {
            incrementBtn: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
            decrementBtn: HTMLElementProxy<CounterViewState, HTMLButtonElement>;
            countDisplay: HTMLElementProxy<CounterViewState, HTMLSpanElement>;
        }
        interface CounterElement extends JayElement<CounterViewState, CounterRefs> {}

        // Pre-render function that creates the element template
        // Must accept options to receive eventWrapper from makeJayComponent
        function renderCounterElement(
            options: RenderElementOptions = {},
        ): [CounterRefs, RenderElement<CounterViewState, CounterRefs, CounterElement>] {
            const [refManager, [incrementRef, decrementRef, countRef]] = ReferencesManager.for(
                options, // Pass through options (contains eventWrapper)
                ['incrementBtn', 'decrementBtn', 'countDisplay'],
                [],
                [],
                [],
            );

            const render = (viewState: CounterViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    return e('div', { class: 'counter' }, [
                        e('button', { class: 'decrement' }, ['-'], decrementRef()),
                        e('span', { class: 'count' }, [dt((vs) => String(vs.count))], countRef()),
                        e('button', { class: 'increment' }, ['+'], incrementRef()),
                    ]);
                }) as CounterElement;

            return [refManager.getPublicAPI() as CounterRefs, render];
        }

        // Component logic
        interface CounterProps {
            initialCount: number;
        }

        function CounterComponent({ initialCount }: Props<CounterProps>, refs: CounterRefs) {
            const [count, setCount] = createSignal(initialCount());

            refs.incrementBtn.onclick(() => setCount(count() + 1));
            refs.decrementBtn.onclick(() => setCount(count() - 1));

            return {
                render: () => ({
                    count: count(),
                    label: 'Counter',
                }),
                // Expose setCount for testing state changes
                setCount,
            };
        }

        const Counter = makeJayComponent(renderCounterElement, CounterComponent);

        it('should expose viewState through AI API', () => {
            const instance = Counter({ initialCount: 5 });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            expect(state.viewState).toEqual({ count: 5, label: 'Counter' });
        });

        it('should expose refs as interactions', () => {
            const instance = Counter({ initialCount: 0 });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            expect(state.interactions.length).toBe(3);
            expect(state.interactions.map((i) => i.refName).sort()).toEqual([
                'countDisplay',
                'decrementBtn',
                'incrementBtn',
            ]);
        });

        it('should find interaction by coordinate', () => {
            const instance = Counter({ initialCount: 0 });
            const wrapped = wrapWithAutomation(instance);

            const interaction = wrapped.automation.getInteraction(['incrementBtn']);

            expect(interaction).toBeDefined();
            expect(interaction!.refName).toBe('incrementBtn');
            expect(interaction!.element).toBeInstanceOf(HTMLButtonElement);
        });

        it('should notify on state change after interaction', () => {
            const instance = Counter({ initialCount: 5 });
            const wrapped = wrapWithAutomation(instance);

            const callback = vi.fn();
            wrapped.automation.onStateChange(callback);

            const interaction = wrapped.automation.getInteraction(['incrementBtn']);
            interaction.element.click();

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0].viewState.count).toBe(6);
        });

        it('should notify on state changes via setCount', () => {
            const instance = Counter({ initialCount: 0 });
            const wrapped = wrapWithAutomation(instance);

            const callback = vi.fn();
            wrapped.automation.onStateChange(callback);

            // Change state directly using exposed setCount
            instance.setCount(5);

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback.mock.calls[0][0].viewState.count).toBe(5);
        });

        it('should support multiple state changes', () => {
            const instance = Counter({ initialCount: 0 });
            const wrapped = wrapWithAutomation(instance);

            const states: number[] = [];
            wrapped.automation.onStateChange((state) => {
                states.push((state.viewState as CounterViewState).count);
            });

            // Change state directly
            instance.setCount(1);
            instance.setCount(2);
            instance.setCount(1);

            expect(states).toEqual([1, 2, 1]);
        });

        it('should update viewState correctly after state change', () => {
            const instance = Counter({ initialCount: 0 });
            const wrapped = wrapWithAutomation(instance);

            // Change state
            instance.setCount(42);

            // Verify viewState reflects the change
            const state = wrapped.automation.getPageState();
            expect(state.viewState).toEqual({ count: 42, label: 'Counter' });
        });
    });

    describe('Component with forEach (Collection Refs)', () => {
        // Define types
        interface TodoItem {
            id: string;
            text: string;
        }

        interface TodoListViewState {
            items: TodoItem[];
        }

        interface TodoListRefs {
            removeBtn: any; // HTMLElementCollectionProxy
        }

        interface TodoListElement extends JayElement<TodoListViewState, TodoListRefs> {}

        function renderTodoListElement(
            options: RenderElementOptions = {},
        ): [TodoListRefs, RenderElement<TodoListViewState, TodoListRefs, TodoListElement>] {
            const [refManager, [removeRef]] = ReferencesManager.for(
                options, // Pass through options (contains eventWrapper)
                [], // no single refs
                ['removeBtn'], // one collection ref
                [],
                [],
            );

            const render = (viewState: TodoListViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    // Use de() (dynamicElement) for container with forEach
                    return de('div', { class: 'todo-list' }, [
                        de('ul', { class: 'items' }, [
                            forEach(
                                (vs: TodoListViewState) => vs.items,
                                (item: TodoItem) => {
                                    return e('li', { 'data-id': item.id }, [
                                        item.text,
                                        e('button', { class: 'remove' }, ['×'], removeRef()),
                                    ]);
                                },
                                'id',
                            ),
                        ]),
                    ]);
                }) as TodoListElement;

            return [refManager.getPublicAPI() as TodoListRefs, render];
        }

        interface TodoListProps {
            initialItems: TodoItem[];
        }

        function TodoListComponent({ initialItems }: Props<TodoListProps>, refs: TodoListRefs) {
            const [items, setItems] = createSignal<TodoItem[]>(initialItems());

            refs.removeBtn.onclick(({ viewState }: { viewState: TodoItem }) => {
                setItems(items().filter((item) => item.id !== viewState.id));
            });

            return {
                render: () => ({
                    items: items(),
                }),
                // Expose for testing
                setItems,
                getItems: () => items(),
            };
        }

        const TodoList = makeJayComponent(renderTodoListElement, TodoListComponent);

        const initialItems: TodoItem[] = [
            { id: '1', text: 'First item' },
            { id: '2', text: 'Second item' },
            { id: '3', text: 'Third item' },
        ];

        it('should expose list items in viewState', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            expect((state.viewState as TodoListViewState).items).toHaveLength(3);
            expect((state.viewState as TodoListViewState).items[0].text).toBe('First item');
        });

        it('should notify on state changes when items are modified', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            const callback = vi.fn();
            wrapped.automation.onStateChange(callback);

            // Remove an item using setItems
            instance.setItems([initialItems[0], initialItems[2]]);

            expect(callback).toHaveBeenCalledTimes(1);
            expect((callback.mock.calls[0][0].viewState as TodoListViewState).items).toHaveLength(
                2,
            );
        });

        it('should expose collection refs as interactions with coordinates', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            // Should have 3 remove buttons (one per item)
            const removeInteractions = state.interactions.filter((i) => i.refName === 'removeBtn');
            expect(removeInteractions).toHaveLength(3);

            // Each should have a coordinate with the item id
            const coordinates = removeInteractions.map((i) => i.coordinate);
            // Coordinates should include the item ID
            expect(coordinates.some((c) => c.includes('1'))).toBe(true);
            expect(coordinates.some((c) => c.includes('2'))).toBe(true);
            expect(coordinates.some((c) => c.includes('3'))).toBe(true);
        });

        it('should include itemContext for collection interactions', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();
            const removeInteractions = state.interactions.filter((i) => i.refName === 'removeBtn');

            // Each interaction should have itemContext with the item data
            const item2Interaction = removeInteractions.find(
                (i) => (i.itemContext as TodoItem)?.id === '2',
            );

            expect(item2Interaction).toBeDefined();
            expect((item2Interaction!.itemContext as TodoItem).text).toBe('Second item');
        });

        it('should update interactions after items change', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            // Remove item 2
            instance.setItems([initialItems[0], initialItems[2]]);

            const state = wrapped.automation.getPageState();
            const removeInteractions = state.interactions.filter((i) => i.refName === 'removeBtn');

            // Should now have 2 remove buttons
            expect(removeInteractions).toHaveLength(2);

            // Item 2 should no longer be in the interactions
            const item2Exists = removeInteractions.some(
                (i) => (i.itemContext as TodoItem)?.id === '2',
            );
            expect(item2Exists).toBe(false);
        });
    });
});
