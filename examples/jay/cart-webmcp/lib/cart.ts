import { render, CartElementRefs, ItemOfCartViewState } from './cart.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export interface CartProps {
    initialItems: CartItem[];
}

function CartConstructor({ initialItems }: Props<CartProps>, refs: CartElementRefs) {
    const [items, setItems] = createSignal<CartItem[]>(initialItems());

    // Computed values
    const total = createMemo(() =>
        items().reduce((sum, item) => sum + item.price * item.quantity, 0),
    );
    const itemCount = createMemo(() => items().reduce((sum, item) => sum + item.quantity, 0));

    // Increase quantity
    refs.items.increaseBtn.onclick(({ viewState }: { viewState: ItemOfCartViewState }) => {
        setItems(
            items().map((item) =>
                item.id === viewState.id ? { ...item, quantity: item.quantity + 1 } : item,
            ),
        );
    });

    // Decrease quantity
    refs.items.decreaseBtn.onclick(({ viewState }: { viewState: ItemOfCartViewState }) => {
        setItems(
            items().map((item) =>
                item.id === viewState.id && item.quantity > 1
                    ? { ...item, quantity: item.quantity - 1 }
                    : item,
            ),
        );
    });

    // Remove item
    refs.items.removeBtn.onclick(({ viewState }: { viewState: ItemOfCartViewState }) => {
        setItems(items().filter((item) => item.id !== viewState.id));
    });

    // Add item
    refs.addBtn.onclick(() => {
        refs.nameInput.exec$((nameEl) => {
            refs.priceInput.exec$((priceEl) => {
                const name = (nameEl as HTMLInputElement).value.trim();
                const price = parseFloat((priceEl as HTMLInputElement).value) || 0;

                if (name && price > 0) {
                    const newItem: CartItem = {
                        id: `item-${Date.now()}`,
                        name,
                        price,
                        quantity: 1,
                    };
                    setItems([...items(), newItem]);

                    // Clear inputs
                    (nameEl as HTMLInputElement).value = '';
                    (priceEl as HTMLInputElement).value = '';
                }
            });
        });
    });

    return {
        render: () => ({
            items,
            total,
            itemCount,
        }),
        // Expose for programmatic access
        getItems: () => items(),
        setItems,
    };
}

export const CartComponent = makeJayComponent(render, CartConstructor);
