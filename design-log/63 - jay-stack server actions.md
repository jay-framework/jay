# Jay Stack Server Actions

## Background

Jay Stack pages currently support a three-phase rendering model:
1. **Slow Render** (build/data-change time) - Loads static data, pre-renders HTML
2. **Fast Render** (request time) - Loads dynamic data, completes SSR
3. **Interactive** (client time) - Handles user interactions with reactive state

However, once the page is loaded, **client-side code has no way to call server-side functions**. This is a critical gap for building real applications.

## Problem

In real applications, client components need to call server-side code for:

1. **Search**: User types in search box → call server search API
2. **Mutations**: Add to cart, place order, update profile
3. **Data fetching**: Load more items, refresh data
4. **Form submissions**: Submit contact form, checkout

Currently, developers would need to:
- Set up a separate API (Express routes, etc.)
- Manually create fetch calls
- Handle serialization/deserialization
- Lose type safety between client and server

### Example: Current Gap

```typescript
// pages/products/[slug]/page.ts
function ProductsPageConstructor(
    props: Props<PageProps>,
    refs: PageRefs,
    fastViewState: Signals<PageFastViewState>,
    fastCarryForward: ProductAndInventoryCarryForward,
) {
    refs.addToCart.onclick(() => {
        // ❌ How do we call the server to add to cart?
        // There's no mechanism for this!
        addToCart(fastCarryForward.productId, 1);
    });

    return { render: () => ({}) };
}
```

## Questions and Answers

1. **Q: Should actions be defined per-page or globally?**
   - A: **Globally as standalone modules.** This enables reuse across pages and components. Actions are developer-to-developer (frontend ↔ backend), not designer-to-developer like contracts.

2. **Q: How should actions relate to services?**
   - A: Actions use the same service injection pattern as render functions via `.withServices()`.

3. **Q: Should actions be type-safe end-to-end?**
   - A: Yes, using a builder pattern with explicit input/output types.

4. **Q: How does this integrate with the contract system?**
   - A: **It doesn't.** Contracts are for designer ↔ developer communication. Actions are backend API definitions, purely developer concern.

5. **Q: What about authentication/authorization?**
   - A: Actions can optionally receive request context for auth checks.

6. **Q: Where should action modules live?**
   - A: In `src/actions/` directory, organized by domain (e.g., `cart.actions.ts`, `search.actions.ts`).

## Design Options Considered

| Option | Description | Verdict |
|--------|-------------|---------|
| **Page-scoped actions** | Actions defined in `.withActions()` on the component builder | ❌ Not reusable across pages |
| **Contract-based actions** | Actions defined in `.jay-contract` files | ❌ Contracts are designer↔developer; actions are developer↔developer |
| **Hybrid (page + standalone)** | Both page-scoped and standalone modules | ❌ Two ways to do same thing creates confusion |
| **`'use server'` directive** | Next.js-style magic directive | ❌ Requires complex compiler magic, less explicit |
| **RPC-style standalone modules** | tRPC-inspired builder pattern | ✅ **Chosen** |

### Why RPC-Style Standalone Modules

1. **Reusability** - Actions can be imported from any component, page, or context
2. **Explicit** - Clear what runs on server vs client (no magic directives)
3. **Type-safe** - Full inference from handler function signature
4. **Familiar pattern** - Builder API consistent with `makeJayStackComponent`
5. **Service injection** - Same `.withServices()` pattern as render phases
6. **Separation of concerns** - Actions are backend API definitions, not UI contracts

## Design: RPC-Style Action Builder

Actions are defined as standalone modules using a builder pattern similar to `makeJayStackComponent`. They can be imported and called from any client component or context.

### Action Builder API

Types are **inferred from the handler function** - no need to specify separate Input/Output types:

```typescript
// @jay-framework/fullstack-component

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// For mutations (default: POST)
export function makeJayAction(name: string): JayActionBuilder<[], unknown, unknown, 'POST'>;

// For queries/reads (default: GET)
export function makeJayQuery(name: string): JayActionBuilder<[], unknown, unknown, 'GET'>;

interface JayActionBuilder<Services extends any[], Input, Output, DefaultMethod extends HttpMethod> {
    withServices<NewServices extends any[]>(
        ...services: ServiceMarkers<NewServices>
    ): JayActionBuilder<NewServices, Input, Output, DefaultMethod>;
    
    // Override HTTP method if needed
    withMethod(method: HttpMethod): JayActionBuilder<Services, Input, Output, DefaultMethod>;
    
    // Enable caching (typically for GET, but allowed for other methods if needed)
    withCaching(options?: CacheOptions): JayActionBuilder<Services, Input, Output, DefaultMethod>;
    
    // Handler defines both input and output types via inference
    withHandler<I, O>(
        handler: (input: I, ...services: Services) => Promise<O>
    ): JayAction<I, O>;
}

interface CacheOptions {
    maxAge?: number;           // seconds
    staleWhileRevalidate?: number;
}

// The callable action/query type (same runtime type)
interface JayAction<Input, Output> {
    // Called from client - makes HTTP request to server
    (input: Input): Promise<Output>;
    
    // Metadata for registration
    readonly actionName: string;
    readonly method: HttpMethod;
    readonly _marker: unique symbol;
}

// Error class for action/query failures
export class ActionError extends Error {
    constructor(
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = 'ActionError';
    }
}
```

### When to Use Each

| Builder | Default Method | Use Case |
|---------|---------------|----------|
| `makeJayAction` | POST | Mutations: add to cart, submit form, update profile |
| `makeJayQuery` | GET | Reads: search, get details, list items |

Both can override the method with `.withMethod()` if needed, but the defaults express intent clearly.

### Error Handling and HTTP Status Codes

Actions distinguish between **business logic errors** (4xx) and **system errors** (5xx):

| Error Type | HTTP Status | When |
|------------|-------------|------|
| `ActionError` thrown | **422** Unprocessable Entity | Business logic failure (out of stock, invalid input, etc.) |
| Other `Error` thrown | **500** Internal Server Error | Unexpected system failure |
| Action not found | **404** Not Found | Invalid action name |
| Wrong HTTP method | **405** Method Not Allowed | GET vs POST mismatch |
| Invalid JSON input | **400** Bad Request | Malformed request body |

**Example:**

```typescript
export const addToCart = makeJayAction('cart.addToCart')
    .withServices(INVENTORY_SERVICE)
    .withHandler(async (input, inventory) => {
        const available = await inventory.getAvailableUnits(input.productId);
        
        // ActionError → 422 (client can handle gracefully)
        if (available < input.quantity) {
            throw new ActionError('NOT_AVAILABLE', 'Product is out of stock');
        }
        
        // Unexpected error → 500 (system failure)
        if (!input.productId) {
            throw new Error('Missing productId'); // Should not happen
        }
        
        return { success: true };
    });
```

**Client-side handling:**

```typescript
try {
    const result = await addToCart({ productId: '123', quantity: 1 });
} catch (error) {
    if (error instanceof ActionError) {
        // Business logic error (4xx) - show to user
        showNotification(error.message);
    } else {
        // System error (5xx) - generic message
        showNotification('Something went wrong. Please try again.');
    }
}
```

### Timeout Configuration

Actions have a configurable timeout to prevent hung requests:

```typescript
interface JayActionBuilder<...> {
    // ... existing methods ...
    
    // Set action timeout (default: 30 seconds)
    withTimeout(ms: number): JayActionBuilder<...>;
}
```

**Server-side timeout:**

```typescript
// Action with custom timeout
export const generateReport = makeJayAction('reports.generate')
    .withTimeout(60000) // 60 seconds for long-running operation
    .withHandler(async (input) => {
        return await generateLargeReport(input);
    });
```

**Default timeout:** 30 seconds (configurable globally)

```typescript
// In jay.init.ts - set global default
import { setActionDefaults } from '@jay-framework/stack-server-runtime';

setActionDefaults({
    timeout: 15000, // 15 seconds default for all actions
});
```

**Timeout behavior:**
- Server cancels handler execution after timeout
- Returns **504 Gateway Timeout** status
- Client receives `ActionError` with code `'TIMEOUT'`

### Defining Actions

Input and output types are inferred from the handler function signature:

```typescript
// src/actions/cart.actions.ts
import { makeJayAction } from '@jay-framework/fullstack-component';
import { CART_SERVICE, INVENTORY_SERVICE } from '../services';

// ✅ Types inferred from handler - input type from parameter, output from return
// ✅ Uses ActionError for failures (thrown, not returned)
export const addToCart = makeJayAction('cart.addToCart')
    .withServices(CART_SERVICE, INVENTORY_SERVICE)
    .withHandler(async (
        input: { productId: string; quantity: number },
        cartService,
        inventory,
    ) => {
        const available = await inventory.getAvailableUnits(input.productId);
        if (available < input.quantity) {
            throw new ActionError(
                'NOT_AVAILABLE',
                `Only ${available} units available`,
            );
        }
        
        const cart = await cartService.addItem(input.productId, input.quantity);
        
        return { cartItemCount: cart.items.length };
    });

// ✅ No input needed - use empty object or void
export const getCart = makeJayAction('cart.getCart')
    .withServices(CART_SERVICE)
    .withHandler(async (_input: void, cartService) => {
        return cartService.getCart();
    });

// ✅ Simple inline types
export const removeFromCart = makeJayAction('cart.removeFromCart')
    .withServices(CART_SERVICE)
    .withHandler(async (input: { itemId: string }, cartService) => {
        await cartService.removeItem(input.itemId);
        return { success: true };
    });
```

```typescript
// src/actions/search.actions.ts
import { makeJayQuery } from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE } from '../services';

// ✅ makeJayQuery defaults to GET - enables browser/CDN caching
export const searchProducts = makeJayQuery('products.search')
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withCaching({ maxAge: 60, staleWhileRevalidate: 120 })
    .withHandler(async (
        input: { query: string; page?: number; limit?: number },
        productsDb,
    ) => {
        const results = await productsDb.search(input.query, {
            page: input.page ?? 1,
            limit: input.limit ?? 20,
        });
        
        return {
            products: results.items,
            totalCount: results.total,
            hasMore: results.hasMore,
        };
    });
```

### Extracting Types (When Needed)

If you need to reference the input/output types elsewhere, use TypeScript utilities:

```typescript
// Extract types from an action
type AddToCartInput = Parameters<typeof addToCart>[0];
type AddToCartOutput = Awaited<ReturnType<typeof addToCart>>;

// Or define a helper type
type ActionInput<T> = T extends JayAction<infer I, any> ? I : never;
type ActionOutput<T> = T extends JayAction<any, infer O> ? O : never;

type Input = ActionInput<typeof addToCart>;  // { productId: string; quantity: number }
type Output = ActionOutput<typeof addToCart>; // { success: boolean; cartItemCount: number; error?: string }
```

### Client Usage

Actions are imported directly and called like regular async functions:

```typescript
// pages/products/[slug]/page.ts
import { addToCart } from '../../../actions/cart.actions';

function ProductsPageConstructor(
    props: Props<PageProps>,
    refs: PageRefs,
    fastViewState: Signals<PageFastViewState>,
    fastCarryForward: ProductAndInventoryCarryForward,
) {
    const [isAdding, setIsAdding] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    refs.addToCart.onclick(async () => {
        setIsAdding(true);
        setError(null);
        
        try {
            // ✅ Type-safe action call - TypeScript knows input/output types
            const result = await addToCart({
                productId: fastCarryForward.productId,
                quantity: 1,
            });
            // Success! result.cartItemCount is available
        } catch (e) {
            // ✅ ActionError provides code and message
            if (e instanceof ActionError) {
                setError(e.message); // "Only 2 units available"
                // e.code === 'NOT_AVAILABLE'
            } else {
                setError('Network error. Please try again.');
            }
        } finally {
            setIsAdding(false);
        }
    });

    return {
        render: () => ({
            isAdding,
            error,
        }),
    };
}
```

### Using Actions in Client Context

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
    refresh: () => Promise<void>;
}

export const CART_CONTEXT = createJayContext<CartContextValue>();

// Call this in a parent component to provide the cart context
export const provideCartContext = () =>
    provideReactiveContext(CART_CONTEXT, () => {
        const [items, setItems] = createSignal<CartItem[]>([]);
        const [isLoading, setIsLoading] = createSignal(false);

        const refresh = async () => {
            setIsLoading(true);
            try {
                const cart = await getCart();
                setItems(cart.items);
            } finally {
                setIsLoading(false);
            }
        };

        const add = async (productId: string, quantity: number) => {
            setIsLoading(true);
            try {
                const result = await addToCart({ productId, quantity });
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

        return {
            items,
            itemCount: () => items().length,
            isLoading,
            add,
            remove,
            refresh,
        };
    });
```

## Project Structure

```
src/
├── actions/                    # Action definitions
│   ├── cart.actions.ts         # Cart-related actions
│   ├── search.actions.ts       # Search actions
│   ├── user.actions.ts         # User/auth actions
│   └── index.ts                # Re-exports
├── services/                   # Service definitions
│   ├── cart.service.ts
│   ├── products.service.ts
│   └── index.ts
├── contexts/                   # Client contexts (can use actions)
│   ├── cart.context.ts
│   └── user.context.ts
├── pages/
│   ├── products/
│   │   └── [slug]/
│   │       ├── page.jay-html
│   │       ├── page.jay-contract
│   │       └── page.ts
│   └── search/
│       ├── page.jay-html
│       └── page.ts
└── jay.init.ts                 # Service registration
```

## How It Works: Under the Hood

### Build/Dev Time

1. **Action Discovery**: The dev-server/build scans `src/actions/` for action definitions
2. **Action Registration**: Each action is registered with its name and handler
3. **Client Transform**: When client code imports an action, it's transformed to a fetch call

### Runtime Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│                                                                 │
│  const result = await addToCart({ productId: '123', qty: 1 })  │
│                           │                                     │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Generated client stub:                                   │   │
│  │ POST /_jay/actions/cart.addToCart                       │   │
│  │ Body: { productId: '123', qty: 1 }                      │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server                                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Action Router:                                           │   │
│  │ 1. Parse action name from URL                           │   │
│  │ 2. Look up handler in registry                          │   │
│  │ 3. Resolve services from service registry               │   │
│  │ 4. Call handler(input, ...services)                     │   │
│  │ 5. Serialize and return response                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  const handler = actionRegistry.get('cart.addToCart');         │
│  const cartService = getService(CART_SERVICE);                 │
│  const inventory = getService(INVENTORY_SERVICE);              │
│  const result = await handler(input, cartService, inventory);  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client                                                          │
│                                                                 │
│  result = { success: true, cartItemCount: 3 }                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Client Stub Generation

When building for client, action imports are transformed:

```typescript
// Original (what developer writes)
import { addToCart } from '../actions/cart.actions';

// Transformed (what runs in browser)
import { createActionCaller } from '@jay-framework/stack-client-runtime';

const addToCart = createActionCaller<AddToCartInput, AddToCartOutput>('cart.addToCart');
```

The `createActionCaller` returns a function that:
1. Serializes input to JSON
2. POSTs to `/_jay/actions/{actionName}`
3. Deserializes response
4. Returns typed result

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Action Builder** (`packages/jay-stack/full-stack-component`)
   - `makeJayAction()` function
   - `JayActionBuilder` class with fluent API
   - `JayAction` type with input/output inference

2. **Action Registry** (`packages/jay-stack/stack-server-runtime`)
   - `registerAction(action)` function
   - `getActionHandler(name)` lookup
   - Integration with service registry

3. **Action Router** (`packages/jay-stack/dev-server`)
   - `/_jay/actions/:actionName` POST endpoint
   - Request parsing and validation
   - Service injection and handler execution

### Phase 2: Client Runtime

1. **Action Caller** (`packages/jay-stack/stack-client-runtime`)
   - `createActionCaller<Input, Output>(name)` function
   - Fetch wrapper with error handling
   - Response type inference

2. **Build Transform** (`packages/compiler`)
   - Detect action imports in client code
   - Replace with `createActionCaller` calls
   - Preserve type information

### Phase 3: Developer Experience

1. **Error Handling**
   - `ActionError` class with code and message
   - Network error handling
   - Timeout configuration

2. **Request Context** (optional)
   - `.withRequestContext()` builder method
   - Access to headers, cookies
   - Auth token extraction

3. **Validation** (optional)
   - `.withValidation(zodSchema)` method
   - Runtime input validation on server

## Examples

### Search Page

```typescript
// src/actions/search.actions.ts
import { makeJayQuery } from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE } from '../services';

// makeJayQuery = GET by default, with caching
export const searchProducts = makeJayQuery('products.search')
    .withServices(PRODUCTS_DATABASE_SERVICE)
    .withCaching({ maxAge: 60 })
    .withHandler(async (
        input: { query: string; page?: number },
        productsDb,
    ) => {
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

```typescript
// pages/search/page.ts
import { searchProducts } from '../../actions/search.actions';

function SearchPageConstructor(props, refs, viewState, carryForward) {
    const [query, setQuery] = createSignal('');
    const [results, setResults] = createSignal<Product[]>([]);
    const [isSearching, setIsSearching] = createSignal(false);

    refs.searchInput.oninput((e) => {
        setQuery(e.target.value);
    });

    refs.searchButton.onclick(async () => {
        if (!query()) return;
        
        setIsSearching(true);
        try {
            const response = await searchProducts({ query: query() });
            setResults(response.products);
        } finally {
            setIsSearching(false);
        }
    });

    return {
        render: () => ({
            query,
            results,
            isSearching,
            resultCount: () => results().length,
        }),
    };
}
```

### Product Page with Add to Cart

```typescript
// src/actions/cart.actions.ts
import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';
import { CART_SERVICE, INVENTORY_SERVICE } from '../services';

// POST (default) for mutations
export const addToCart = makeJayAction('cart.addToCart')
    .withServices(CART_SERVICE, INVENTORY_SERVICE)
    .withHandler(async (
        input: { productId: string; quantity: number },
        cartService,
        inventory,
    ) => {
        const available = await inventory.getAvailableUnits(input.productId);
        if (available < input.quantity) {
            throw new ActionError('NOT_AVAILABLE', `Only ${available} units available`);
        }
        
        const cart = await cartService.addItem(input.productId, input.quantity);
        return { cartItemCount: cart.items.length };
    });
```

```typescript
// pages/products/[slug]/page.ts
import { addToCart } from '../../../actions/cart.actions';
import { ActionError } from '@jay-framework/fullstack-component';

function ProductsPageConstructor(
    props: Props<PageProps>,
    refs: PageRefs,
    viewState: Signals<PageFastViewState>,
    carryForward: ProductCarryForward,
) {
    const [quantity, setQuantity] = createSignal(1);
    const [isAdding, setIsAdding] = createSignal(false);
    const [addError, setAddError] = createSignal<string | null>(null);

    refs.quantityInput.oninput((e) => {
        setQuantity(parseInt(e.target.value, 10) || 1);
    });

    refs.addToCart.onclick(async () => {
        setIsAdding(true);
        setAddError(null);
        
        try {
            const result = await addToCart({
                productId: carryForward.productId,
                quantity: quantity(),
            });
            // Success! result.cartItemCount available
        } catch (e) {
            if (e instanceof ActionError) {
                setAddError(e.message);
            } else {
                setAddError('Network error. Please try again.');
            }
        } finally {
            setIsAdding(false);
        }
    });

    return {
        render: () => ({
            quantity,
            isAdding,
            addError,
        }),
    };
}
```

## Build Transform Design

Actions need different handling on server vs client:
- **Server**: Execute handler directly with service injection
- **Client**: Make HTTP request to `/_jay/actions/:actionName`

The jay-stack compiler plugin handles this transformation.

### Action Sources

Actions can come from two places:

| Source | Location | Example |
|--------|----------|---------|
| **Project actions** | `src/actions/*.ts` | `src/actions/cart.actions.ts` |
| **Plugin actions** | `node_modules/@jay-plugin-*/actions.ts` | `@jay-plugin-store/actions` |

Both follow the same pattern - export `JayAction` instances created with `makeJayAction`/`makeJayQuery`.

### Plugin Action Pattern

Plugins export actions alongside their components:

```typescript
// @jay-plugin-store/lib/actions.ts
import { makeJayAction, makeJayQuery } from '@jay-framework/fullstack-component';

export const addToCart = makeJayAction('store.addToCart')
    .withServices(STORE_SERVICE)
    .withHandler(async (input, storeService) => {
        return storeService.addToCart(input.productId, input.quantity);
    });

export const searchProducts = makeJayQuery('store.search')
    .withServices(STORE_SERVICE)
    .withCaching({ maxAge: 60 })
    .withHandler(async (input, storeService) => {
        return storeService.search(input.query);
    });
```

```typescript
// @jay-plugin-store/lib/index.ts
export * from './actions';
export * from './components';
```

### Transformation Location

The transformation happens in **`@jay-framework/compiler-jay-stack`** (the jay-stack Vite/Rollup plugin).

**Why this plugin?**
- Already handles jay-stack specific transforms (client/server code splitting)
- Has access to build context (client vs SSR)
- Runs for both project code and plugin dependencies

### Detection: What to Transform

The transform identifies action imports by:

1. **Import source detection** - Imports from:
   - `src/actions/*` (project actions)
   - `@jay-plugin-*/actions` (plugin actions)
   - Any module exporting `JayAction` types

2. **Runtime marker detection** - The `JayAction` has `_brand: 'JayAction'` marker

3. **Export analysis** - Scan exports for `JayAction` type instances

### Transform Rules

| Build Target | Import Statement | Transformation |
|--------------|------------------|----------------|
| **SSR/Server** | `import { addToCart } from './actions/cart.actions'` | **No change** - use original handler |
| **Client** | `import { addToCart } from './actions/cart.actions'` | Replace with `createActionCaller` |

### Client Transform

```typescript
// BEFORE (source code)
import { addToCart, searchProducts } from '../actions/cart.actions';

const result = await addToCart({ productId: '123', quantity: 1 });

// AFTER (client build)
import { createActionCaller } from '@jay-framework/stack-client-runtime';

const addToCart = createActionCaller('cart.addToCart', 'POST');
const searchProducts = createActionCaller('products.search', 'GET');

const result = await addToCart({ productId: '123', quantity: 1 });
```

### Implementation Approach

#### Option A: Static Analysis (Recommended)

Parse imports, identify action exports, replace with `createActionCaller`:

```typescript
// In compiler-jay-stack plugin
function transformActionImports(code: string, id: string, isSSR: boolean) {
    if (isSSR) return code; // No transform for server
    
    // Parse and find action imports
    const actionImports = findActionImports(code);
    
    for (const imp of actionImports) {
        // Load the action module to get metadata
        const actionModule = await loadActionModule(imp.source);
        
        // Replace import with createActionCaller calls
        code = replaceImportWithCallers(code, imp, actionModule);
    }
    
    return code;
}
```

**Pros:**
- Clean separation of concerns
- No runtime overhead
- Works with tree-shaking

**Cons:**
- Requires parsing action modules at build time
- Need to track action metadata (name, method)

#### Option B: Virtual Module Pattern

Create virtual modules that re-export actions appropriately:

```typescript
// For client builds, resolve 'src/actions/cart.actions' to:
// 'virtual:jay-actions/cart.actions'

// Virtual module content:
import { createActionCaller } from '@jay-framework/stack-client-runtime';
export const addToCart = createActionCaller('cart.addToCart', 'POST');
export const searchProducts = createActionCaller('products.search', 'GET');
```

**Pros:**
- Cleaner transform (no code rewriting)
- Easy to debug (can inspect virtual module)

**Cons:**
- More complex Vite plugin setup
- Need to generate virtual modules dynamically

### Recommended: Option A with Metadata Extraction

1. **At build start**: Scan action files, extract metadata (name, method) from each action
2. **During transform**: Replace client imports using cached metadata
3. **For plugins**: Scan plugin `plugin.yaml` for `actions` array

### Action Discovery

#### Project Actions

Scan `src/actions/` for files matching `*.actions.ts`:

```typescript
async function discoverProjectActions(projectRoot: string) {
    const actionsDir = path.join(projectRoot, 'src/actions');
    const files = await glob('**/*.actions.ts', { cwd: actionsDir });
    
    const actions = new Map<string, ActionMetadata>();
    
    for (const file of files) {
        const module = await parseActionModule(path.join(actionsDir, file));
        for (const action of module.exports) {
            actions.set(action.name, {
                name: action.name,
                method: action.method,
                importPath: `./src/actions/${file}`,
                exportName: action.exportName,
            });
        }
    }
    
    return actions;
}
```

#### Plugin Actions

Plugins declare action exports in `plugin.yaml`:

```yaml
# @jay-plugin-store/plugin.yaml
name: "@jay-plugin-store"
version: "1.0.0"

actions:
  - addToCart
  - removeFromCart
  - getCart
  - searchProducts
```

These are **named exports** from the plugin's backend bundle. The compiler:
1. **Server build**: Imports these exports from the plugin backend bundle, auto-registers them
2. **Client build**: Transforms imports of these exports to `createActionCaller()` calls

```typescript
// Plugin backend bundle exports the actions
// @jay-plugin-store/dist/backend.js
export { addToCart, removeFromCart, getCart } from './actions/cart.actions';
export { searchProducts } from './actions/search.actions';
```

### Registration Flow

Actions are auto-registered - no manual registration needed:

```
┌─────────────────────────────────────────────────────────────────┐
│ Build Time                                                       │
│                                                                 │
│  1. Discover actions:                                           │
│     - Project: scan src/actions/*.actions.ts                    │
│     - Plugins: read plugin.yaml → actions array                 │
│  2. Extract metadata (name, method, services)                   │
│  3. Generate registration code (injected into server entry)     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Server Startup (auto-generated)                                 │
│                                                                 │
│  1. Import discovered action modules                            │
│  2. Auto-register all actions                                   │
│  3. Actions available at /_jay/actions/*                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client Build                                                    │
│                                                                 │
│  1. Action imports transformed → createActionCaller()           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Client Runtime                                                  │
│                                                                 │
│  1. Call action → HTTP request to /_jay/actions/:name           │
│  2. Server executes handler, returns result                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Auto-Registration (Default Behavior)

Actions are auto-registered via generated code injected into the server entry:

**Discovery sources:**
1. **Project actions**: Scan `src/actions/*.actions.ts` for `JayAction` exports
2. **Plugin actions**: Named exports listed in `plugin.yaml` → `actions` array

**Generated registration code (injected into server entry):**

```typescript
// Auto-generated by compiler
import { registerAction } from '@jay-framework/stack-server-runtime';

// Project actions
import * as cartActions from './src/actions/cart.actions';
import * as searchActions from './src/actions/search.actions';

// Plugin actions (named exports from plugin.yaml)
import { addToCart, getCart } from '@jay-plugin-store/backend';

// Auto-register all
[cartActions, searchActions].forEach(mod => 
    Object.values(mod).filter(isJayAction).forEach(registerAction)
);
registerAction(addToCart);
registerAction(getCart);
```

**Manual Registration API** (for dynamic or conditional actions):

```typescript
// jay.init.ts - Optional manual registration
import { registerAction } from '@jay-framework/stack-server-runtime';
import { customAction } from './custom/my-action';

export async function onInit() {
    // Auto-registration already happened
    // Manually register additional actions if needed
    registerAction(customAction);
}
```

### Open Questions (Compiler)

1. **Plugin action convention?**
   - Option A: `package.json` `jay.actions` field
   - Option B: Conventional `/actions` export
   - Option C: `plugin.yaml` `actions` array
   - **Answer:** Use `plugin.yaml` with named exports. The `actions` array lists export names from the plugin's backend bundle. Server imports and registers these exports; client build transforms them to `createActionCaller()` calls.

2. **Auto-registration?**
   - Manual: Explicit in `jay.init.ts` (current)
   - Auto: Compiler generates registration code
   - **Answer:** Auto-registration is the default. Compiler generates registration code injected into server entry. Scans project `src/actions/` and plugin `plugin.yaml` action exports. Provide `registerAction()` API for optional manual registration of additional actions.

3. **Development mode?**
   - Should dev server re-scan actions on file change?
   - **Answer:** Yes, watch `src/actions/` and plugin changes

4. **Type generation?**
   - Generate `.d.ts` for client callers?
   - **Answer:** Not needed if transform preserves types

## Trade-offs Accepted

1. **Build-time transform required** - Client imports need to be transformed to HTTP callers
2. **Separate files** - Actions live in `src/actions/` not alongside pages (intentional for reuse)
3. **Explicit action names** - Must provide unique action name string (enables stable endpoints)

## Open Questions

1. **How to handle authentication?**
   - Option A: Always inject request context
   - Option B: Opt-in via `.withRequestContext()`
   - **Answer:** Defer for now. Will need a default strategy + custom strategy injection. Requires handshake between page loading and action calls. Address in future iteration.

2. **Action naming convention?**
   - Current: `'domain.action'` (e.g., `'cart.addToCart'`)
   - Alternative: Auto-generate from file path + export name
   - **Answer:** Use explicit names. Less compiler transformation, more predictable endpoints.

3. **Error handling patterns?**
   - Return error in output type (current examples)
   - Throw `ActionError` 
   - Or support both?
   - **Answer:** Use `throw new ActionError(code, message)`. Clear error messages, consistent pattern. Client receives structured error response.

4. **Batching/deduplication?**
   - Should identical concurrent calls be deduplicated?
   - Useful for search debouncing
   - **Answer:** Not needed for now. Keep it simple.

5. **HTTP method and caching?**
   - Should actions support GET method for cacheable queries?
   - **Answer:** Yes. Add `.withMethod('GET' | 'POST')` (default: POST) and `.withCaching()` options. GET enables browser/CDN caching for read-only operations.

6. **Is it still an "action" if we allow GET?**
   - GET requests are typically queries, not actions/mutations
   - **Answer:** Provide both builders:
     - `makeJayAction(name)` - defaults to POST, for mutations
     - `makeJayQuery(name)` - defaults to GET, for reads
   - Both can override method with `.withMethod()` if needed. Same runtime type (`JayAction<I, O>`), just different defaults. Clear intent in code.

---

## Implementation Results

### Phase 1: Core Infrastructure ✅

**Action Builder API** (`@jay-framework/fullstack-component`)
- `makeJayAction(name)` - POST default, for mutations
- `makeJayQuery(name)` - GET default, for reads
- Builder chain: `.withServices()`, `.withMethod()`, `.withCaching()`, `.withHandler()`
- `ActionError` class for business logic errors
- 14 tests passing

**Action Registry** (`@jay-framework/stack-server-runtime`)
- `ActionRegistry` class (not global singleton, for testability)
- Methods: `register()`, `execute()`, `get()`, `has()`, `getNames()`, `clear()`, `getCacheHeaders()`
- Default instance exported as `actionRegistry`
- Legacy function exports for backwards compatibility
- 16 tests passing

**Action Router** (`@jay-framework/dev-server`)
- Endpoint: `/_jay/actions/:actionName`
- Validates HTTP method against action definition
- GET: parses input from query string (simple params or `_input` JSON)
- POST/PUT/PATCH/DELETE: parses input from request body
- Returns 422 for ActionError, 500 for other errors
- Sets Cache-Control headers for GET with caching
- 10 tests passing

### Phase 2: Client Runtime ✅

**Action Caller** (`@jay-framework/stack-client-runtime`)
- `createActionCaller(actionName, method)` - creates client-side action caller
- `setActionCallerOptions({ baseUrl, headers, timeout })` - global config
- `ActionError` class (client-side)
- Handles timeouts, network errors, business logic errors
- 19 tests passing

### Phase 3: Compiler Transform ✅

**Action Import Transform** (`@jay-framework/compiler-jay-stack`)
- `transformActionImports()` - transforms client action imports to `createActionCaller()`
- `extractActionsFromSource()` - parses action modules to extract metadata
- `isActionImport()`, `isActionModule()` - detection helpers
- Integrated into `jayStackCompiler()` plugin array
- 18 tests passing

**Transform behavior:**
- Server builds: No transform (actions execute directly)
- Client builds: Replace `import { addToCart } from './actions/cart.actions'` with `const addToCart = createActionCaller('cart.addToCart', 'POST')`

### Phase 4: Auto-Registration ✅

**Action Discovery** (`@jay-framework/stack-server-runtime`)
- `discoverAndRegisterActions()` - scans `src/actions/*.actions.ts` and registers actions
- `discoverPluginActions()` - reads `plugin.yaml` for plugin action declarations
- Recursive directory scanning for nested action files
- Integrated into `ServiceLifecycleManager.initialize()`
- 6 tests passing

**Dev-Server Integration**
- Actions auto-discovered after `jay.init.ts` runs
- Actions cleared and re-discovered on hot reload
- No manual `registerAction()` calls needed in user code

### Phase 5: Plugin Actions ✅

**Plugin Action Discovery** (`@jay-framework/stack-server-runtime`)
- `discoverAllPluginActions()` - scans `src/plugins/` for plugins with actions
- `discoverPluginActions()` - reads `plugin.yaml`, imports and registers declared actions
- Integrated into `ServiceLifecycleManager.initialize()`
- 5 new tests for plugin discovery

**Plugin Manifest Extension** (`@jay-framework/compiler-shared`)
- Added `actions?: string[]` field to `PluginManifest` interface
- Actions are named exports from the plugin module

**Example: product-rating plugin**
- Added `submitRating` and `getRatings` actions
- Demonstrates plugin actions pattern

### Phase 6: Plugin Client Build ✅

**Plugin Build Configuration**
- Plugins use `jayStackCompiler` in their vite.config.ts (already handles action transform)
- Client build (`isSsrBuild = false`) transforms action imports to `createActionCaller()`
- Plugin must add `@jay-framework/stack-client-runtime` to externals

**Example vite.config.ts for plugin with actions:**

```typescript
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

**Test Coverage**
- Added test for plugin component importing actions from same plugin
- 19 tests passing in compiler-jay-stack

---

## Learnings and Deviations

### Design Decisions Made During Implementation

1. **ActionRegistry as Class (not singleton)**
   - Original design implied global registry
   - Changed to class with default instance for better testability
   - Each test can create isolated registry instances

2. **Plugin YAML Parsing Reuse**
   - Initially created custom `parseSimpleYaml()` in action-discovery
   - Refactored to use `loadPluginManifest()` from `@jay-framework/compiler-shared`
   - Eliminates duplication, uses proper YAML library

3. **Handler Simplification**
   - Original design had `withHandler` return a placeholder function
   - Simplified to directly call the handler when action is invoked server-side
   - Client builds transform to HTTP calls anyway

4. **Test Pattern for Discriminated Unions**
   - TypeScript struggled with type narrowing for `ActionExecutionResult`
   - Used `expect(result).toMatchObject()` pattern instead of property access
   - Provides better error messages and type inference

### Files Structure

Key implementation files:
- `full-stack-component/lib/jay-action-builder.ts` - Builder API
- `stack-server-runtime/lib/action-registry.ts` - Server registry
- `stack-server-runtime/lib/action-discovery.ts` - Auto-registration
- `dev-server/lib/action-router.ts` - HTTP endpoint
- `stack-client-runtime/lib/action-caller.ts` - Client caller
- `compiler-jay-stack/lib/transform-action-imports.ts` - Build transform
- `compiler-jay-stack/lib/index.ts` - Vite plugin with resolveId + load hooks

### Plugin Build Transform Fix

**Problem:** When building a plugin package, the `transform` hook runs AFTER Rollup has resolved and inlined internal imports. This means action imports like `import { submitMood } from './mood-actions'` get bundled before the transform can replace them with `createActionCaller`.

**Solution:** Use `resolveId` + `load` hooks instead of `transform`:

1. **`resolveId`** - Intercepts action module imports BEFORE bundling
   - Checks `isActionImport(source)` to identify action modules
   - Returns a virtual module ID: `\0jay-action:${actualPath}`
   
2. **`load`** - Generates virtual module content for the virtual ID
   - Reads actual action file and extracts metadata via `extractActionsFromSource()`
   - Returns code with `createActionCaller` exports instead of handlers

**Additional fixes required:**

1. **TypeScript bridge** - Direct `import * as ts from 'typescript'` fails in ESM bundles. Changed to use `@jay-framework/typescript-bridge` which loads TypeScript via `createRequire`.

2. **Hyphen pattern support** - Updated `isActionImport()` to match both:
   - `cart.actions.ts` (dot pattern)
   - `mood-actions.ts` (hyphen pattern)

3. **SSR detection** - Used IIFE with closure variable to track `isSSRBuild` across plugin lifecycle hooks, since `configResolved` and `resolveId` don't share `this` context.

**Result:**
| Bundle | File Size | Actions |
|--------|-----------|---------|
| Client | 2.23 kB | `createActionCaller()` HTTP calls |
| Server | 2.65 kB | `makeJayAction().withHandler()` |

---

## Implementation Complete

All phases of server actions are now implemented:
1. ✅ Action Builder API
2. ✅ Action Registry
3. ✅ Action Router
4. ✅ Client Action Caller
5. ✅ Compiler Transform
6. ✅ Auto-Registration (project actions)
7. ✅ Plugin Actions
8. ✅ Plugin Client Build (with resolveId + load pattern)
