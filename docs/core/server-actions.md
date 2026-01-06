# Server Actions

Server actions enable client-side code to call server-side functions after the initial page load. They provide type-safe RPC (Remote Procedure Call) style communication between your interactive components and the server.

## Overview

Server actions solve a common problem: once a page is loaded, how can the client call the server for operations like:

- **Search**: User types in search box → call server search API
- **Mutations**: Add to cart, place order, update profile
- **Data fetching**: Load more items, refresh data
- **Form submissions**: Submit contact form, checkout

## Quick Start

### 1. Define an Action

```typescript
// src/actions/cart.actions.ts
import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { CART_SERVICE, INVENTORY_SERVICE } from '../services';

export const addToCart = makeJayAction('cart.addToCart')
  .withServices(CART_SERVICE, INVENTORY_SERVICE)
  .withHandler(async (input: { productId: string; quantity: number }, cartService, inventory) => {
    const available = await inventory.getAvailableUnits(input.productId);
    if (available < input.quantity) {
      throw new ActionError('NOT_AVAILABLE', `Only ${available} units available`);
    }

    const cart = await cartService.addItem(input.productId, input.quantity);
    return { cartItemCount: cart.items.length };
  });
```

### 2. Call from Client

```typescript
// pages/products/[slug]/page.ts
import { addToCart } from '../../../actions/cart.actions';
import { ActionError } from '@jay-framework/fullstack-component';

function ProductPageInteractive(props, refs, viewState, carryForward) {
  refs.addToCart.onclick(async () => {
    try {
      const result = await addToCart({
        productId: carryForward.productId,
        quantity: 1,
      });
      console.log(`Cart now has ${result.cartItemCount} items`);
    } catch (e) {
      if (e instanceof ActionError) {
        showNotification(e.message); // "Only 2 units available"
      }
    }
  });

  return { render: () => ({}) };
}
```

## Action Builders

Jay Stack provides two builders for different use cases:

| Builder         | Default Method | Use Case                                            |
| --------------- | -------------- | --------------------------------------------------- |
| `makeJayAction` | POST           | Mutations: add to cart, submit form, update profile |
| `makeJayQuery`  | GET            | Reads: search, get details, list items (cacheable)  |

### makeJayAction (Mutations)

For operations that modify data:

```typescript
import { makeJayAction } from '@jay-framework/fullstack-component';

export const addToCart = makeJayAction('cart.addToCart')
  .withServices(CART_SERVICE)
  .withHandler(async (input: { productId: string; quantity: number }, cartService) => {
    const cart = await cartService.addItem(input.productId, input.quantity);
    return { success: true, cartItemCount: cart.items.length };
  });

export const updateProfile = makeJayAction('user.updateProfile')
  .withServices(USER_SERVICE)
  .withHandler(async (input: { name: string; email: string }, userService) => {
    await userService.update(input);
    return { updated: true };
  });
```

### makeJayQuery (Reads)

For read-only operations that can be cached:

```typescript
import { makeJayQuery } from '@jay-framework/fullstack-component';

export const searchProducts = makeJayQuery('products.search')
  .withServices(PRODUCTS_DATABASE_SERVICE)
  .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
  .withHandler(async (input: { query: string; page?: number }, productsDb) => {
    const results = await productsDb.search(input.query, {
      page: input.page ?? 1,
      limit: 20,
    });
    return {
      products: results.items,
      totalCount: results.total,
      hasMore: results.hasMore,
    };
  });
```

## Builder API

### `.withServices(...serviceMarkers)`

Inject server-side services (same pattern as `makeJayStackComponent`):

```typescript
import { createJayService } from '@jay-framework/fullstack-component';

const CART_SERVICE = createJayService<CartService>('Cart');
const INVENTORY_SERVICE = createJayService<InventoryService>('Inventory');

export const addToCart = makeJayAction('cart.addToCart')
  .withServices(CART_SERVICE, INVENTORY_SERVICE)
  .withHandler(async (input, cartService, inventory) => {
    // cartService and inventory are injected
  });
```

### `.withMethod(method)`

Override the default HTTP method:

```typescript
export const createProduct = makeJayAction('products.create')
  .withMethod('PUT')
  .withHandler(async (input) => {
    /* ... */
  });

export const deleteProduct = makeJayAction('products.delete')
  .withMethod('DELETE')
  .withHandler(async (input: { id: string }) => {
    /* ... */
  });
```

Supported methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`

### `.withCaching(options)`

Enable caching for GET requests:

```typescript
export const getCategories = makeJayQuery('products.categories')
  .withCaching({
    maxAge: 300, // Cache for 5 minutes
    staleWhileRevalidate: 600, // Serve stale for 10 minutes while revalidating
  })
  .withHandler(async () => {
    /* ... */
  });
```

## Error Handling

### ActionError (Business Logic Errors)

Use `ActionError` for expected error conditions that the client should handle:

```typescript
import { ActionError } from '@jay-framework/fullstack-component';

export const addToCart = makeJayAction('cart.addToCart').withHandler(
  async (input, cartService, inventory) => {
    const available = await inventory.getAvailableUnits(input.productId);

    if (available < input.quantity) {
      // Returns 422 Unprocessable Entity
      throw new ActionError('NOT_AVAILABLE', 'Product is out of stock');
    }

    if (!input.productId) {
      throw new ActionError('INVALID_INPUT', 'Product ID is required');
    }

    return { success: true };
  },
);
```

### Client-Side Error Handling

```typescript
import { ActionError } from '@jay-framework/stack-client-runtime';

try {
  const result = await addToCart({ productId: '123', quantity: 1 });
} catch (error) {
  if (error instanceof ActionError) {
    // Business logic error (4xx) - show to user
    console.log(error.code); // 'NOT_AVAILABLE'
    console.log(error.message); // 'Product is out of stock'
    showNotification(error.message);
  } else {
    // System error (5xx) - generic message
    showNotification('Something went wrong. Please try again.');
  }
}
```

### HTTP Status Codes

| Error Type           | HTTP Status                   | When                      |
| -------------------- | ----------------------------- | ------------------------- |
| `ActionError` thrown | **422** Unprocessable Entity  | Business logic failure    |
| Other `Error` thrown | **500** Internal Server Error | Unexpected system failure |
| Action not found     | **404** Not Found             | Invalid action name       |
| Wrong HTTP method    | **405** Method Not Allowed    | GET vs POST mismatch      |
| Invalid JSON input   | **400** Bad Request           | Malformed request body    |

## Project Structure

Actions are organized in the `src/actions/` directory:

```
src/
├── actions/                    # Action definitions
│   ├── cart.actions.ts         # Cart-related actions
│   ├── search.actions.ts       # Search queries
│   ├── user.actions.ts         # User/auth actions
│   └── index.ts                # Re-exports
├── services/                   # Service definitions
│   ├── cart.service.ts
│   ├── products.service.ts
│   └── index.ts
├── pages/
│   └── products/
│       └── [slug]/
│           └── page.ts         # Uses actions from src/actions/
└── jay.init.ts                 # Service registration
```

## Auto-Registration

Actions are **automatically discovered and registered** on server startup:

1. **Project actions**: All `*.actions.ts` files in `src/actions/` are scanned
2. **Plugin actions**: Actions declared in `plugin.yaml` are registered

No manual registration is needed in `jay.init.ts`.

## Using Actions in Client Context

Actions can be wrapped in a reactive context for shared state management:

```typescript
// src/contexts/cart.context.ts
import { createSignal, provideReactiveContext } from '@jay-framework/component';
import { createJayContext } from '@jay-framework/runtime';
import { addToCart, getCart, removeFromCart } from '../actions/cart.actions';

export interface CartContextValue {
  items: () => CartItem[];
  itemCount: () => number;
  isLoading: () => boolean;
  add: (productId: string, quantity: number) => Promise<boolean>;
  remove: (itemId: string) => Promise<void>;
}

export const CART_CONTEXT = createJayContext<CartContextValue>();

// Call this in a parent component to provide the cart context
export const provideCartContext = () =>
  provideReactiveContext(CART_CONTEXT, () => {
    const [items, setItems] = createSignal<CartItem[]>([]);
    const [isLoading, setIsLoading] = createSignal(false);

    const refresh = async () => {
      const cart = await getCart({});
      setItems(cart.items);
    };

    const add = async (productId: string, quantity: number) => {
      setIsLoading(true);
      try {
        await addToCart({ productId, quantity });
        await refresh();
        return true;
      } catch (e) {
        return false;
      } finally {
        setIsLoading(false);
      }
    };

    const remove = async (itemId: string) => {
      setIsLoading(true);
      try {
        await removeFromCart({ itemId });
        await refresh();
      } finally {
        setIsLoading(false);
      }
    };

    return { items, itemCount: () => items().length, isLoading, add, remove };
  });
```

## Type Inference

Input and output types are automatically inferred from the handler function:

```typescript
// Types are inferred from handler signature
export const addToCart = makeJayAction('cart.addToCart').withHandler(
  async (
    input: { productId: string; quantity: number }, // Input type
    // services...
  ) => {
    return { cartItemCount: 5 }; // Output type
  },
);

// Client gets full type safety
const result = await addToCart({ productId: '123', quantity: 1 });
//    ^? { cartItemCount: number }
```

### Extracting Types

If you need to reference types elsewhere:

```typescript
type AddToCartInput = Parameters<typeof addToCart>[0];
// ^? { productId: string; quantity: number }

type AddToCartOutput = Awaited<ReturnType<typeof addToCart>>;
// ^? { cartItemCount: number }
```

## How It Works

### Client-Side Transform

When building for the client, action imports are transformed:

```typescript
// Original (developer writes)
import { addToCart } from '../actions/cart.actions';

// Transformed (what runs in browser)
import { createActionCaller } from '@jay-framework/stack-client-runtime';
const addToCart = createActionCaller('cart.addToCart', 'POST');
```

### Runtime Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│  const result = await addToCart({ productId: '123', qty: 1 })  │
│                           │                                     │
│                           ▼                                     │
│  POST /_jay/actions/cart.addToCart                             │
│  Body: { productId: '123', qty: 1 }                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server                                                          │
│  1. Look up handler in registry                                │
│  2. Resolve services from service registry                     │
│  3. Call handler(input, ...services)                           │
│  4. Return JSON response                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│  result = { cartItemCount: 3 }                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# Plugin Actions

Plugins can also define and export actions for use by projects that install them.

## Declaring Plugin Actions

In your plugin's `plugin.yaml`, declare which exports are actions:

```yaml
# @jay-plugin-store/plugin.yaml
name: '@jay-plugin-store'
version: '1.0.0'

actions:
  - addToCart
  - removeFromCart
  - getCart
  - searchProducts
```

## Defining Plugin Actions

Define actions in your plugin's source:

```typescript
// @jay-plugin-store/lib/actions/cart.actions.ts
import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';
import { STORE_SERVICE } from '../services';

export const addToCart = makeJayAction('store.addToCart')
  .withServices(STORE_SERVICE)
  .withHandler(async (input, storeService) => {
    return storeService.addToCart(input.productId, input.quantity);
  });

export const getCart = makeJayQuery('store.getCart')
  .withServices(STORE_SERVICE)
  .withHandler(async (_input, storeService) => {
    return storeService.getCart();
  });
```

Export them from your plugin's main module:

```typescript
// @jay-plugin-store/lib/index.ts
export { addToCart, removeFromCart, getCart } from './actions/cart.actions';
export { searchProducts } from './actions/search.actions';
// ... other exports
```

## Using Plugin Actions

Projects can import and use plugin actions like any other action:

```typescript
// In a project using @jay-plugin-store
import { addToCart, searchProducts } from '@jay-plugin-store';

// In an interactive component
refs.addToCart.onclick(async () => {
  const result = await addToCart({ productId: '123', quantity: 1 });
});
```

## Plugin Build Configuration

If your plugin uses actions internally (e.g., a plugin component calling a plugin action), ensure your Vite config externalizes the client runtime:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { jayStackCompiler, jayOptions } from '@jay-framework/compiler-jay-stack';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    ssr: isSsrBuild,
    rollupOptions: {
      external: [
        '@jay-framework/fullstack-component',
        '@jay-framework/stack-client-runtime', // Required for action callers
        // ... other externals
      ],
    },
  },
}));
```

## Plugin Action Auto-Registration

Plugin actions listed in `plugin.yaml` are automatically discovered and registered when the server starts. The discovery process:

1. Scans `src/plugins/` for local plugins with `plugin.yaml`
2. Reads the `actions` array from each manifest
3. Imports the named exports and registers them

No additional configuration needed in the project's `jay.init.ts`.

---

## Best Practices

### 1. Use Descriptive Action Names

Use `domain.action` naming convention:

```typescript
// ✅ Good - clear domain and action
makeJayAction('cart.addToCart');
makeJayAction('user.updateProfile');
makeJayQuery('products.search');

// ❌ Avoid - too generic
makeJayAction('add');
makeJayAction('update');
```

### 2. Throw ActionError for Business Logic

```typescript
// ✅ Good - use ActionError for expected failures
if (available < quantity) {
  throw new ActionError('NOT_AVAILABLE', 'Product is out of stock');
}

// ❌ Avoid - returning error in result
return { success: false, error: 'Not available' };
```

### 3. Use makeJayQuery for Read Operations

```typescript
// ✅ Good - GET for reads, enables caching
export const searchProducts = makeJayQuery('products.search')
  .withCaching({ maxAge: 60 })
  .withHandler(async (input) => {
    /* ... */
  });

// ❌ Avoid - POST for read-only operations
export const searchProducts = makeJayAction('products.search').withHandler(async (input) => {
  /* ... */
});
```

### 4. Keep Actions Focused

```typescript
// ✅ Good - single responsibility
export const addToCart = makeJayAction('cart.addToCart').withHandler(async (input) => {
  /* add item */
});

export const updateQuantity = makeJayAction('cart.updateQuantity').withHandler(async (input) => {
  /* update quantity */
});

// ❌ Avoid - doing too much
export const cartOperation = makeJayAction('cart.operation').withHandler(async (input) => {
  if (input.type === 'add') {
    /* ... */
  }
  if (input.type === 'update') {
    /* ... */
  }
  if (input.type === 'remove') {
    /* ... */
  }
});
```

## Next Steps

- Learn about [Jay Stack Components](./jay-stack.md) for full-stack page development
- Explore [Service Management](./jay-stack.md#service-management) for server-side dependencies
- Check out the [Examples](../examples/) for working patterns
