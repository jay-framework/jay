# Component Context

Context provides a way to share state between components without passing props through every level.

## Context Markers

Create a typed marker to identify a context:

```typescript
import { createContextMarker } from '@jay-framework/component';

interface CartContext {
    itemCount: () => number;
    addItem: (productId: string) => void;
}

const CART_CONTEXT = createContextMarker<CartContext>('CartContext');
```

## provideContext

Provide a non-reactive context value to child components:

```typescript
import { provideContext } from '@jay-framework/component';

provideContext(CART_CONTEXT, {
    itemCount: () => items().length,
    addItem: (id) => addToCartAction({ productId: id }),
});
```

## provideReactiveContext

Provide a reactive context — the factory function has access to hooks:

```typescript
import { provideReactiveContext, createSignal } from '@jay-framework/component';

const cartCtx = provideReactiveContext(CART_CONTEXT, () => {
    const [items, setItems] = createSignal<CartItem[]>([]);
    return {
        itemCount: () => items().length,
        addItem: (id) => setItems(prev => [...prev, { productId: id }]),
    };
});
```

The returned value is the context instance, usable in the same component.

## registerReactiveGlobalContext

Register a context globally during client initialization (in `makeJayInit`):

```typescript
import { registerReactiveGlobalContext, createSignal } from '@jay-framework/component';

export const init = makeJayInit()
    .withClient(() => {
        registerReactiveGlobalContext(CART_CONTEXT, () => {
            const [items, setItems] = createSignal<CartItem[]>([]);
            return {
                itemCount: () => items().length,
                addItem: (id) => setItems(prev => [...prev, { productId: id }]),
            };
        });
    });
```

Global contexts are available to all components without explicit providing.

## Consuming Context

Components consume contexts via `.withContexts()` on the builder:

```typescript
makeJayStackComponent<MyContract>()
    .withContexts(CART_CONTEXT)
    .withInteractive(function MyComp(props, refs, cartCtx) {
        refs.addToCart.onClick(() => {
            cartCtx.addItem(props.productId);
        });

        return {
            render: () => ({
                cartCount: cartCtx.itemCount(),
            }),
        };
    });
```
