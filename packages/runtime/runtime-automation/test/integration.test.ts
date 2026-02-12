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

        it('should expose refs as grouped interactions', () => {
            const instance = Counter({ initialCount: 0 });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            expect(state.interactions.length).toBe(3);
            expect(state.interactions.map((i) => i.ref).sort()).toEqual([
                'countDisplay',
                'decrementBtn',
                'incrementBtn',
            ]);
            // All are non-forEach, so no inForEach/items
            state.interactions.forEach((i) => {
                expect(i.inForEach).toBeUndefined();
                expect(i.items).toBeUndefined();
            });
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

        it('should expose collection refs as grouped interaction with items', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            // Should have 1 grouped interaction for removeBtn
            const removeGroup = state.interactions.find((i) => i.ref === 'removeBtn');
            expect(removeGroup).toBeDefined();
            expect(removeGroup!.inForEach).toBe(true);
            expect(removeGroup!.items).toHaveLength(3);

            // Items should have IDs from trackBy
            const itemIds = removeGroup!.items!.map((i) => i.id);
            expect(itemIds).toContain('1');
            expect(itemIds).toContain('2');
            expect(itemIds).toContain('3');
        });

        it('should include labels from itemContext', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();
            const removeGroup = state.interactions.find((i) => i.ref === 'removeBtn')!;

            // guessLabel should pick 'text' field (after checking name/title/label first)
            const item2 = removeGroup.items!.find((i) => i.id === '2');
            expect(item2).toBeDefined();
            expect(item2!.label).toBe('Second item');
        });

        it('should update grouped interactions after items change', () => {
            const instance = TodoList({ initialItems });
            const wrapped = wrapWithAutomation(instance);

            // Remove item 2
            instance.setItems([initialItems[0], initialItems[2]]);

            const state = wrapped.automation.getPageState();
            const removeGroup = state.interactions.find((i) => i.ref === 'removeBtn');

            // Should now have 2 items
            expect(removeGroup!.items).toHaveLength(2);

            // Item 2 should no longer be present
            const item2Exists = removeGroup!.items!.some((i) => i.id === '2');
            expect(item2Exists).toBe(false);
        });
    });

    describe('Component with Nested Refs (Headless Components)', () => {
        // Simulates a page with a nested "cart" headless component
        interface CartItem {
            id: string;
            name: string;
        }

        interface PageViewState {
            title: string;
            cart: {
                items: CartItem[];
            };
        }

        interface CartRefs {
            removeBtn: any; // Collection ref inside cart
            checkoutBtn: any; // Single ref inside cart
        }

        interface PageRefs {
            headerBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
            cart: CartRefs;
        }

        interface PageElement extends JayElement<PageViewState, PageRefs> {}

        function renderPageElement(
            options: RenderElementOptions = {},
        ): [PageRefs, RenderElement<PageViewState, PageRefs, PageElement>] {
            // Create nested ref manager for cart (simulates headless component)
            const cartRefManager = new ReferencesManager(options?.eventWrapper);
            const [cartCheckoutRef, cartRemoveRef] = cartRefManager.mkRefs(
                ['checkoutBtn'], // single refs in cart
                ['removeBtn'], // collection refs in cart
                [],
                [],
            );

            // Create main ref manager with nested cart refs
            const [refManager, [headerRef]] = ReferencesManager.for(
                options,
                ['headerBtn'], // page-level single refs
                [], // page-level collection refs
                [],
                [],
                { cart: cartRefManager }, // nested ref managers
            );

            const render = (viewState: PageViewState) =>
                ConstructContext.withRootContext(viewState, refManager, () => {
                    return de('div', { class: 'page' }, [
                        e('header', {}, [
                            e('button', { class: 'header-btn' }, ['Menu'], headerRef()),
                        ]),
                        de('div', { class: 'cart' }, [
                            e('button', { class: 'checkout' }, ['Checkout'], cartCheckoutRef()),
                            de('ul', { class: 'cart-items' }, [
                                forEach(
                                    (vs: PageViewState) => vs.cart.items,
                                    (item: CartItem) => {
                                        return e('li', { 'data-id': item.id }, [
                                            item.name,
                                            e(
                                                'button',
                                                { class: 'remove' },
                                                ['×'],
                                                cartRemoveRef(),
                                            ),
                                        ]);
                                    },
                                    'id',
                                ),
                            ]),
                        ]),
                    ]);
                }) as PageElement;

            return [refManager.getPublicAPI() as PageRefs, render];
        }

        interface PageProps {
            title: string;
            cartItems: CartItem[];
        }

        function PageComponent({ title, cartItems }: Props<PageProps>, refs: PageRefs) {
            const [items, setItems] = createSignal<CartItem[]>(cartItems());

            refs.cart.removeBtn.onclick(({ viewState }: { viewState: CartItem }) => {
                setItems(items().filter((item) => item.id !== viewState.id));
            });

            return {
                render: () => ({
                    title: title(),
                    cart: {
                        items: items(),
                    },
                }),
                setItems,
            };
        }

        const Page = makeJayComponent(renderPageElement, PageComponent);

        const initialCartItems: CartItem[] = [
            { id: 'prod-1', name: 'Widget' },
            { id: 'prod-2', name: 'Gadget' },
        ];

        it('should collect grouped interactions from nested refs (headless components)', () => {
            const instance = Page({ title: 'Shop', cartItems: initialCartItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();

            // Should have: headerBtn + checkoutBtn + removeBtn (grouped) = 3 groups
            expect(state.interactions.length).toBe(3);

            // Check that all ref names are present
            const refNames = state.interactions.map((i) => i.ref);
            expect(refNames).toContain('headerBtn');
            expect(refNames).toContain('checkoutBtn');
            expect(refNames).toContain('removeBtn');
        });

        it('should find raw interactions from nested refs by coordinate', () => {
            const instance = Page({ title: 'Shop', cartItems: initialCartItems });
            const wrapped = wrapWithAutomation(instance);

            // Find checkout button (nested in cart) via getInteraction
            const checkoutInteraction = wrapped.automation.getInteraction(['checkoutBtn']);
            expect(checkoutInteraction).toBeDefined();
            expect(checkoutInteraction!.refName).toBe('checkoutBtn');
        });

        it('should include items for nested collection refs', () => {
            const instance = Page({ title: 'Shop', cartItems: initialCartItems });
            const wrapped = wrapWithAutomation(instance);

            const state = wrapped.automation.getPageState();
            const removeGroup = state.interactions.find((i) => i.ref === 'removeBtn')!;

            expect(removeGroup.inForEach).toBe(true);
            expect(removeGroup.items).toHaveLength(2);

            const itemIds = removeGroup.items!.map((i) => i.id);
            expect(itemIds).toContain('prod-1');
            expect(itemIds).toContain('prod-2');
        });

        it('should update nested grouped interactions after state change', () => {
            const instance = Page({ title: 'Shop', cartItems: initialCartItems });
            const wrapped = wrapWithAutomation(instance);

            // Remove one item
            instance.setItems([initialCartItems[0]]);

            const state = wrapped.automation.getPageState();
            const removeGroup = state.interactions.find((i) => i.ref === 'removeBtn')!;

            // Should now have 1 item
            expect(removeGroup.items).toHaveLength(1);

            // prod-2 should no longer be in items
            const prod2Exists = removeGroup.items!.some((i) => i.id === 'prod-2');
            expect(prod2Exists).toBe(false);
        });

        it('should trigger events on nested refs and update state', () => {
            const instance = Page({ title: 'Shop', cartItems: initialCartItems });
            const wrapped = wrapWithAutomation(instance);

            const callback = vi.fn();
            wrapped.automation.onStateChange(callback);

            // Use getInteraction to find the remove button for prod-1 (raw coordinate)
            const prod1RemoveBtn = wrapped.automation.getInteraction(['prod-1', 'removeBtn']);
            expect(prod1RemoveBtn).toBeDefined();

            // Trigger click on the remove button using its coordinate
            wrapped.automation.triggerEvent('click', prod1RemoveBtn!.coordinate);

            // State should have been updated
            expect(callback).toHaveBeenCalled();
            const newState = callback.mock.calls[0][0];
            expect((newState.viewState as PageViewState).cart.items).toHaveLength(1);
            expect((newState.viewState as PageViewState).cart.items[0].id).toBe('prod-2');
        });

        it('should trigger events on nested single refs', () => {
            const instance = Page({ title: 'Shop', cartItems: initialCartItems });
            const wrapped = wrapWithAutomation(instance);

            // Find checkout button (nested single ref)
            const checkoutBtn = wrapped.automation.getInteraction(['checkoutBtn']);
            expect(checkoutBtn).toBeDefined();

            // Should be able to click it (even if no handler, just verify no error)
            expect(() => {
                wrapped.automation.triggerEvent('click', ['checkoutBtn']);
            }).not.toThrow();
        });
    });
});
