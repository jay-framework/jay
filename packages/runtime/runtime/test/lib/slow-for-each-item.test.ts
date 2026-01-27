import { describe, expect, it } from 'vitest';
import {
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    slowForEachItem,
    forEach,
    ConstructContext,
    ReferencesManager,
    JayElement,
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
    function makeProductListElement(data: ViewState): JayElement<ViewState, any> {
        const [refManager] = ReferencesManager.for({}, [], [], [], []);
        return ConstructContext.withRootContext(data, refManager, () =>
            de('ul', {}, [
                slowForEachItem<ViewState, Product>((vs) => vs.products, 0, 'p1', () =>
                    e('li', {}, ['Widget A - ', dt((item: Product) => `$${item?.price}`)]),
                ),
                slowForEachItem<ViewState, Product>((vs) => vs.products, 1, 'p2', () =>
                    e('li', {}, ['Widget B - ', dt((item: Product) => `$${item?.price}`)]),
                ),
            ]),
        );
    }

    describe('rendering', () => {
        it('should render pre-rendered array items with correct context', () => {
            const jayElement = makeProductListElement({
                products: [
                    { id: 'p1', name: 'Widget A', price: 10 },
                    { id: 'p2', name: 'Widget B', price: 20 },
                ],
                title: 'Products',
            });

            const items = jayElement.dom.querySelectorAll('li');
            expect(items).toHaveLength(2);
            expect(items[0].textContent).toBe('Widget A - $10');
            expect(items[1].textContent).toBe('Widget B - $20');
        });

        it('should handle nested object bindings within items', () => {
            interface CartItem {
                id: string;
                product: { name: string; category: string };
                quantity: number;
            }
            interface CartViewState {
                items: CartItem[];
            }

            function makeCartElement(data: CartViewState): JayElement<CartViewState, any> {
                const [refManager] = ReferencesManager.for({}, [], [], [], []);
                return ConstructContext.withRootContext(data, refManager, () =>
                    de('ul', {}, [
                        slowForEachItem<CartViewState, CartItem>((vs) => vs.items, 0, 'c1', () =>
                            e('li', {}, [
                                'Laptop - ',
                                dt(
                                    (item: CartItem) =>
                                        `${item.product.category}: Qty ${item.quantity}`,
                                ),
                            ]),
                        ),
                    ]),
                );
            }

            const jayElement = makeCartElement({
                items: [
                    { id: 'c1', product: { name: 'Laptop', category: 'Electronics' }, quantity: 2 },
                ],
            });

            expect(jayElement.dom.querySelector('li')?.textContent).toBe(
                'Laptop - Electronics: Qty 2',
            );
        });
    });

    describe('updates', () => {
        it('should update when parent ViewState changes', () => {
            const jayElement = makeProductListElement({
                products: [
                    { id: 'p1', name: 'Widget A', price: 10 },
                    { id: 'p2', name: 'Widget B', price: 20 },
                ],
                title: 'Products',
            });

            expect(jayElement.dom.querySelectorAll('li')[0].textContent).toBe('Widget A - $10');

            jayElement.update({
                products: [
                    { id: 'p1', name: 'Widget A', price: 15 },
                    { id: 'p2', name: 'Widget B', price: 25 },
                ],
                title: 'Products',
            });

            const items = jayElement.dom.querySelectorAll('li');
            expect(items[0].textContent).toBe('Widget A - $15');
            expect(items[1].textContent).toBe('Widget B - $25');
        });

        it('should handle multiple sequential updates', () => {
            const jayElement = makeProductListElement({
                products: [
                    { id: 'p1', name: 'Widget A', price: 10 },
                    { id: 'p2', name: 'Widget B', price: 20 },
                ],
                title: 'Products',
            });

            jayElement.update({
                products: [
                    { id: 'p1', name: 'Widget A', price: 100 },
                    { id: 'p2', name: 'Widget B', price: 200 },
                ],
                title: 'Updated',
            });
            jayElement.update({
                products: [
                    { id: 'p1', name: 'Widget A', price: 5 },
                    { id: 'p2', name: 'Widget B', price: 10 },
                ],
                title: 'Final',
            });

            const items = jayElement.dom.querySelectorAll('li');
            expect(items[0].textContent).toBe('Widget A - $5');
            expect(items[1].textContent).toBe('Widget B - $10');
        });

        it('should render undefined when slow-rendered item is missing from new data', () => {
            const jayElement = makeProductListElement({
                products: [
                    { id: 'p1', name: 'Widget A', price: 10 },
                    { id: 'p2', name: 'Widget B', price: 20 },
                ],
                title: 'Products',
            });

            // Initial render works
            const items = jayElement.dom.querySelectorAll('li');
            expect(items[0].textContent).toBe('Widget A - $10');
            expect(items[1].textContent).toBe('Widget B - $20');

            // Update with fewer items - second slow-rendered item now references missing data
            jayElement.update({
                products: [{ id: 'p1', name: 'Widget A', price: 15 }],
                title: 'Products',
            });

            // First item updates correctly
            expect(items[0].textContent).toBe('Widget A - $15');
            // Second item shows undefined (silent failure pattern)
            expect(items[1].textContent).toBe('Widget B - $undefined');
        });

        it('should render undefined when array is completely missing', () => {
            const jayElement = makeProductListElement({
                products: [
                    { id: 'p1', name: 'Widget A', price: 10 },
                    { id: 'p2', name: 'Widget B', price: 20 },
                ],
                title: 'Products',
            });

            // Update with missing array
            jayElement.update({
                products: undefined as any,
                title: 'Empty',
            });

            const items = jayElement.dom.querySelectorAll('li');
            // Both items show undefined (silent failure pattern)
            expect(items[0].textContent).toBe('Widget A - $undefined');
            expect(items[1].textContent).toBe('Widget B - $undefined');
        });
    });

    describe('nested slowForEachItem', () => {
        interface Category {
            id: string;
            name: string;
            products: Product[];
        }
        interface CatalogViewState {
            categories: Category[];
        }

        function makeCatalogElement(data: CatalogViewState): JayElement<CatalogViewState, any> {
            const [refManager] = ReferencesManager.for({}, [], [], [], []);
            return ConstructContext.withRootContext(data, refManager, () =>
                de('div', { class: 'catalog' }, [
                    // Outer slowForEachItem for categories
                    slowForEachItem<CatalogViewState, Category>((vs) => vs.categories, 0, 'cat1', () =>
                        de('section', { class: 'category' }, [
                            e('h2', {}, ['Electronics']),
                            // Nested slowForEachItem for products within category
                            slowForEachItem<Category, Product>((cat) => cat.products, 0, 'p1', () =>
                                e('div', { class: 'product' }, [
                                    'Laptop - ',
                                    dt((item: Product) => `$${item.price}`),
                                ]),
                            ),
                            slowForEachItem<Category, Product>((cat) => cat.products, 1, 'p2', () =>
                                e('div', { class: 'product' }, [
                                    'Phone - ',
                                    dt((item: Product) => `$${item.price}`),
                                ]),
                            ),
                        ]),
                    ),
                    slowForEachItem<CatalogViewState, Category>((vs) => vs.categories, 1, 'cat2', () =>
                        de('section', { class: 'category' }, [
                            e('h2', {}, ['Clothing']),
                            slowForEachItem<Category, Product>((cat) => cat.products, 0, 'p3', () =>
                                e('div', { class: 'product' }, [
                                    'T-Shirt - ',
                                    dt((item: Product) => `$${item.price}`),
                                ]),
                            ),
                        ]),
                    ),
                ]),
            );
        }

        it('should render nested slowForEachItem with correct contexts', () => {
            const jayElement = makeCatalogElement({
                categories: [
                    {
                        id: 'cat1',
                        name: 'Electronics',
                        products: [
                            { id: 'p1', name: 'Laptop', price: 999 },
                            { id: 'p2', name: 'Phone', price: 699 },
                        ],
                    },
                    {
                        id: 'cat2',
                        name: 'Clothing',
                        products: [{ id: 'p3', name: 'T-Shirt', price: 29 }],
                    },
                ],
            });

            const categories = jayElement.dom.querySelectorAll('.category');
            expect(categories).toHaveLength(2);

            const electronicsProducts = categories[0].querySelectorAll('.product');
            expect(electronicsProducts).toHaveLength(2);
            expect(electronicsProducts[0].textContent).toBe('Laptop - $999');
            expect(electronicsProducts[1].textContent).toBe('Phone - $699');

            const clothingProducts = categories[1].querySelectorAll('.product');
            expect(clothingProducts).toHaveLength(1);
            expect(clothingProducts[0].textContent).toBe('T-Shirt - $29');
        });

        it('should update nested items when data changes', () => {
            const jayElement = makeCatalogElement({
                categories: [
                    {
                        id: 'cat1',
                        name: 'Electronics',
                        products: [
                            { id: 'p1', name: 'Laptop', price: 999 },
                            { id: 'p2', name: 'Phone', price: 699 },
                        ],
                    },
                    {
                        id: 'cat2',
                        name: 'Clothing',
                        products: [{ id: 'p3', name: 'T-Shirt', price: 29 }],
                    },
                ],
            });

            jayElement.update({
                categories: [
                    {
                        id: 'cat1',
                        name: 'Electronics',
                        products: [
                            { id: 'p1', name: 'Laptop', price: 899 }, // price changed
                            { id: 'p2', name: 'Phone', price: 599 }, // price changed
                        ],
                    },
                    {
                        id: 'cat2',
                        name: 'Clothing',
                        products: [{ id: 'p3', name: 'T-Shirt', price: 19 }], // price changed
                    },
                ],
            });

            const categories = jayElement.dom.querySelectorAll('.category');
            expect(categories[0].querySelectorAll('.product')[0].textContent).toBe('Laptop - $899');
            expect(categories[0].querySelectorAll('.product')[1].textContent).toBe('Phone - $599');
            expect(categories[1].querySelectorAll('.product')[0].textContent).toBe('T-Shirt - $19');
        });
    });

    describe('forEach under slowForEachItem', () => {
        interface Tag {
            id: string;
            label: string;
        }
        interface ProductWithTags {
            id: string;
            name: string;
            tags: Tag[];
        }
        interface TaggedProductsViewState {
            products: ProductWithTags[];
        }

        function makeTaggedProductElement(
            data: TaggedProductsViewState,
        ): JayElement<TaggedProductsViewState, any> {
            const [refManager] = ReferencesManager.for({}, [], [], [], []);
            return ConstructContext.withRootContext(data, refManager, () =>
                de('div', { class: 'products' }, [
                    // slowForEachItem wraps a pre-rendered product
                    slowForEachItem<TaggedProductsViewState, ProductWithTags>(
                        (vs) => vs.products,
                        0,
                        'prod1',
                        () =>
                            de('article', { class: 'product' }, [
                                e('h3', {}, ['Widget']), // static (pre-rendered)
                                // Dynamic forEach for tags (fast phase)
                                forEach<ProductWithTags, Tag>(
                                    (item) => item.tags,
                                    (tag) => e('span', { class: 'tag' }, [dt((t: Tag) => t.label)]),
                                    'id',
                                ),
                            ]),
                    ),
                ]),
            );
        }

        it('should render dynamic forEach inside slowForEachItem', () => {
            const jayElement = makeTaggedProductElement({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [
                            { id: 't1', label: 'Sale' },
                            { id: 't2', label: 'New' },
                        ],
                    },
                ],
            });

            const product = jayElement.dom.querySelector('.product');
            expect(product).not.toBeNull();
            expect(product!.querySelector('h3')?.textContent).toBe('Widget');

            const tags = product!.querySelectorAll('.tag');
            expect(tags).toHaveLength(2);
            expect(tags[0].textContent).toBe('Sale');
            expect(tags[1].textContent).toBe('New');
        });

        it('should update forEach items when parent changes', () => {
            const jayElement = makeTaggedProductElement({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [{ id: 't1', label: 'Sale' }],
                    },
                ],
            });

            expect(jayElement.dom.querySelectorAll('.tag')).toHaveLength(1);

            // Add more tags
            jayElement.update({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [
                            { id: 't1', label: 'Sale' },
                            { id: 't2', label: 'Popular' },
                            { id: 't3', label: 'Trending' },
                        ],
                    },
                ],
            });

            const tags = jayElement.dom.querySelectorAll('.tag');
            expect(tags).toHaveLength(3);
            expect(tags[0].textContent).toBe('Sale');
            expect(tags[1].textContent).toBe('Popular');
            expect(tags[2].textContent).toBe('Trending');
        });

        it('should handle removing items from forEach inside slowForEachItem', () => {
            const jayElement = makeTaggedProductElement({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [
                            { id: 't1', label: 'Sale' },
                            { id: 't2', label: 'New' },
                            { id: 't3', label: 'Featured' },
                        ],
                    },
                ],
            });

            expect(jayElement.dom.querySelectorAll('.tag')).toHaveLength(3);

            // Remove middle tag
            jayElement.update({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [
                            { id: 't1', label: 'Sale' },
                            { id: 't3', label: 'Featured' },
                        ],
                    },
                ],
            });

            const tags = jayElement.dom.querySelectorAll('.tag');
            expect(tags).toHaveLength(2);
            expect(tags[0].textContent).toBe('Sale');
            expect(tags[1].textContent).toBe('Featured');
        });

        it('should handle reordering items in forEach inside slowForEachItem', () => {
            const jayElement = makeTaggedProductElement({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [
                            { id: 't1', label: 'A' },
                            { id: 't2', label: 'B' },
                            { id: 't3', label: 'C' },
                        ],
                    },
                ],
            });

            // Reorder
            jayElement.update({
                products: [
                    {
                        id: 'prod1',
                        name: 'Widget',
                        tags: [
                            { id: 't3', label: 'C' },
                            { id: 't1', label: 'A' },
                            { id: 't2', label: 'B' },
                        ],
                    },
                ],
            });

            const tags = jayElement.dom.querySelectorAll('.tag');
            expect(tags).toHaveLength(3);
            expect(tags[0].textContent).toBe('C');
            expect(tags[1].textContent).toBe('A');
            expect(tags[2].textContent).toBe('B');
        });
    });
});
