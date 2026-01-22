import { describe, expect, it, beforeEach } from 'vitest';
import {
    element,
    dynamicText,
    slowForEachItem,
    dynamicElement,
    ConstructContext,
    ReferencesManager,
} from '../../lib';

interface Product {
    id: string;
    name: string;
    price: number;
}

interface ViewState {
    products: Product[];
    title: string;
}

describe('slowForEachItem', () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    it('should render pre-rendered array item with correct context', () => {
        const viewState: ViewState = {
            products: [
                { id: 'p1', name: 'Widget A', price: 10 },
                { id: 'p2', name: 'Widget B', price: 20 },
            ],
            title: 'Products',
        };

        const [refManager] = ReferencesManager.for({}, [], [], [], []);

        const result = ConstructContext.withRootContext(viewState, refManager, () => {
            // Simulate pre-rendered slow array items
            // Each item is wrapped with slowForEachItem
            return dynamicElement('ul', {}, [
                slowForEachItem<ViewState, Product>(
                    'products',
                    0,
                    'p1',
                    () => element('li', {}, [
                        // Static text (pre-rendered from slow phase)
                        'Widget A - ',
                        // Dynamic binding (fast phase) - uses item context
                        dynamicText((item: Product) => `$${item.price}`),
                    ]),
                ),
                slowForEachItem<ViewState, Product>(
                    'products',
                    1,
                    'p2',
                    () => element('li', {}, [
                        'Widget B - ',
                        dynamicText((item: Product) => `$${item.price}`),
                    ]),
                ),
            ]);
        });

        container.appendChild(result.dom);

        // Check initial render
        const items = container.querySelectorAll('li');
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toBe('Widget A - $10');
        expect(items[1].textContent).toBe('Widget B - $20');
    });

    it('should update when parent ViewState changes', () => {
        const viewState: ViewState = {
            products: [
                { id: 'p1', name: 'Widget A', price: 10 },
            ],
            title: 'Products',
        };

        const [refManager] = ReferencesManager.for({}, [], [], [], []);

        const result = ConstructContext.withRootContext(viewState, refManager, () => {
            return dynamicElement('ul', {}, [
                slowForEachItem<ViewState, Product>(
                    'products',
                    0,
                    'p1',
                    () => element('li', {}, [
                        'Widget A - ',
                        dynamicText((item: Product) => `$${item.price}`),
                    ]),
                ),
            ]);
        });

        container.appendChild(result.dom);

        // Check initial render
        expect(container.querySelector('li')?.textContent).toBe('Widget A - $10');

        // Update the price
        const newViewState: ViewState = {
            products: [
                { id: 'p1', name: 'Widget A', price: 15 },
            ],
            title: 'Products',
        };

        result.update(newViewState);

        // Check updated render
        expect(container.querySelector('li')?.textContent).toBe('Widget A - $15');
    });

    it('should handle nested bindings within pre-rendered items', () => {
        interface CartItem {
            id: string;
            product: {
                name: string;
                category: string;
            };
            quantity: number;
        }

        interface CartViewState {
            items: CartItem[];
        }

        const viewState: CartViewState = {
            items: [
                {
                    id: 'c1',
                    product: { name: 'Laptop', category: 'Electronics' },
                    quantity: 1,
                },
            ],
        };

        const [refManager] = ReferencesManager.for({}, [], [], [], []);

        const result = ConstructContext.withRootContext(viewState, refManager, () => {
            return dynamicElement('ul', {}, [
                slowForEachItem<CartViewState, CartItem>(
                    'items',
                    0,
                    'c1',
                    () => element('li', {}, [
                        // Static text (pre-rendered)
                        'Laptop - ',
                        // Dynamic binding to nested property
                        dynamicText((item: CartItem) => `Qty: ${item.quantity}`),
                    ]),
                ),
            ]);
        });

        container.appendChild(result.dom);

        expect(container.querySelector('li')?.textContent).toBe('Laptop - Qty: 1');

        // Update quantity
        result.update({
            items: [
                {
                    id: 'c1',
                    product: { name: 'Laptop', category: 'Electronics' },
                    quantity: 3,
                },
            ],
        });

        expect(container.querySelector('li')?.textContent).toBe('Laptop - Qty: 3');
    });
});
