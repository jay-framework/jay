# Jay Stack Components

Jay Stack components enable you to build full-stack applications with server-side rendering, client-side interactivity, and seamless data flow between server and client.

## Overview

Jay Stack components provide:

- **Three-Phase Rendering** - Slow (SSG), Fast (SSR), and Interactive (CSR)
- **Server-Side Rendering** - SEO-friendly, fast initial loads
- **Client-Side Interactivity** - Reactive state management
- **Type Safety** - Full TypeScript support with generated contracts
- **Service Injection** - Server-side dependency injection for database, API clients, etc.
- **Context Support** - Client-side hierarchical context injection
- **URL Parameter Loading** - Dynamic routing with parameter handling

## Rendering Phases

Jay Stack implements three distinct rendering phases for optimal performance:

### 1. Slow Rendering (Build Time)

**Purpose**: Static data and pre-rendering
**When**: Build time or data change time
**Output**: Pre-rendered HTML with static data

```typescript
.withSlowlyRender(async (props, productsDb) => {
  // Load static data that doesn't change often
  const product = await productsDb.getProductBySlug(props.slug);

  return phaseOutput(
    {
      name: product.name,
      sku: product.sku,
      price: product.price
    },
    { productId: product.id } // Carry forward to fast render
  );
})
```

### 2. Fast Rendering (Server Time)

**Purpose**: Dynamic data that can be cached
**When**: Page serving
**Output**: Server-rendered HTML with dynamic data

```typescript
.withFastRender(async (props, carryForward, inventory) => {
  // Load dynamic data that can change
  const status = await inventory.getStatus(carryForward.productId);

  return phaseOutput(
    { inStock: status.available > 0 },
    { productId: carryForward.productId, inStock: status.available > 0 }
  );
})
```

### 3. Interactive Rendering (Client Time)

**Purpose**: Client-side interactivity
**When**: User interaction
**Output**: Reactive UI updates

```typescript
.withInteractive((props, refs, viewStateSignals, fastCarryForward) => {
  // viewStateSignals provides reactive access to FastViewState properties
  const [getInStock, setInStock] = viewStateSignals.inStock;
  
  // fastCarryForward is injected as the first context (after viewStateSignals)
  const productId = fastCarryForward.productId;
  
  const [quantity, setQuantity] = createSignal(1);

  refs.addToCart.onclick(() => {
    addToCart({ productId, quantity: quantity() });
  });

  return {
    render: () => ({ 
      quantity,
      // You can also use signals from fast phase
      stockAvailable: getInStock()
    }),
  };
})
```

## Component Builder API

Jay Stack uses a fluent builder API for creating full-stack components:

```typescript
import {
  makeJayStackComponent,
  phaseOutput,
  createJayService,
} from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE } from './services';

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE)
  .withContexts(ThemeContext, UserContext)
  .withLoadParams(urlLoader)
  .withSlowlyRender(slowlyRender)
  .withFastRender(fastRender)
  .withInteractive(interactive);
```

### Builder Methods

#### `.withProps<PropsType>()`

Defines the component's props type:

```typescript
interface ProductPageProps {
  userId: string;
  preferences: UserPreferences;
}

makeJayStackComponent<ProductContract>().withProps<ProductPageProps>();
```

#### `.withServices(...serviceMarkers)`

Adds server-side service markers for dependency injection:

```typescript
import { createJayService } from '@jay-framework/fullstack-component';

const PRODUCTS_DATABASE_SERVICE = createJayService<ProductsDatabase>('ProductsDatabase');
const INVENTORY_SERVICE = createJayService<InventoryService>('Inventory');

makeJayStackComponent<ProductContract>().withServices(PRODUCTS_DATABASE_SERVICE, INVENTORY_SERVICE);
```

Services are global singletons (not hierarchical) that provide infrastructure capabilities like database connections, API clients, and other server-side resources. They are registered in the `jay.init.ts` file at the project root.

#### `.withContexts(...contextMarkers)`

Adds client-side context markers for dependency injection:

```typescript
import { createJayContext } from '@jay-framework/runtime';

const ThemeContext = createJayContext<Theme>();
const UserContext = createJayContext<User>();

makeJayStackComponent<ProductContract>().withContexts(ThemeContext, UserContext);
```

Contexts are hierarchical and reactive, allowing components to access shared state from parent components. They are provided using `provideContext` or `provideReactiveContext` in parent components.

#### `.withLoadParams(loadParams)`

Defines how URL parameters are loaded and converted to props:

```typescript
interface ProductParams extends UrlParams {
  slug: string;
}

async function* urlLoader(productsDb: ProductsDatabase): AsyncIterable<ProductParams[]> {
  const products = await productsDb.getAllProducts();
  yield products.map(({ slug }) => ({ slug }));
}

makeJayStackComponent<ProductContract>()
  .withServices(PRODUCTS_DATABASE_SERVICE)
  .withLoadParams(urlLoader);
```

The URL loader receives the requested services as parameters, allowing you to query the database or other services to generate URL parameters.

#### `.withSlowlyRender(slowlyRender)`

Defines the slow rendering function for semi-static data:

```typescript
async function slowlyRender(props: ProductPageProps & ProductParams, productsDb: ProductsDatabase) {
  const product = await productsDb.getProductBySlug(props.slug);

  return phaseOutput(
    {
      name: product.name,
      sku: product.sku,
      price: product.price,
    },
    { productId: product.id },
  );
}

makeJayStackComponent<ProductContract>()
  .withServices(PRODUCTS_DATABASE_SERVICE)
  .withSlowlyRender(slowlyRender);
```

The slow render function receives props and the requested services as parameters.

#### `.withFastRender(fastRender)`

Defines the fast rendering function for dynamic data:

```typescript
async function fastRender(
  props: ProductPageProps & ProductParams,
  slowCarryForward: { productId: string },  // Injected as FIRST SERVICE
  inventory: InventoryService,               // Then requested services
) {
  const status = await inventory.getStatus(slowCarryForward.productId);

  return phaseOutput(
    { inStock: status.available > 0 },
    { productId: slowCarryForward.productId, inStock: status.available > 0 },
  );
}

makeJayStackComponent<ProductContract>().withServices(INVENTORY_SERVICE).withFastRender(fastRender);
```

**Parameter order:**
1. **props** - Component props
2. **slowCarryForward** - Carry forward data from slow render (injected as **first service**)
3. **...requestedServices** - Services specified via `withServices()`

#### `.withInteractive(componentConstructor)`

Defines the client-side interactive component:

```typescript
function interactiveConstructor(
  props: ProductPageProps & ProductParams,  // Props only (NO carry forward)
  refs,
  viewStateSignals,                         // Signals<FastViewState>
  fastCarryForward,                         // Carry forward from fast (FIRST CONTEXT)
  themeContext: Theme,                      // Then requested contexts
  userContext: User,
) {
  // Access fast-phase ViewState as reactive signals
  const [getInStock, setInStock] = viewStateSignals.inStock;
  
  // Access carry forward data
  const productId = fastCarryForward.productId;
  
  const [quantity, setQuantity] = createSignal(1);

  refs.addToCart.onclick(() => {
    addToCart({ productId, quantity: quantity() });
  });

  return {
    render: () => ({
      quantity,
      theme: themeContext.currentTheme,
      stockStatus: getInStock(), // Use signal from fast phase
    }),
  };
}

makeJayStackComponent<ProductContract>()
  .withContexts(ThemeContext, UserContext)
  .withInteractive(interactiveConstructor);
```

**Parameter order:**

1. **props** - From `withProps()` + URL params (does NOT include carry forward)
2. **refs** - Interactive element references from the contract
3. **viewStateSignals** - Reactive signals for FastViewState properties (`Signals<FastViewState>`)
4. **fastCarryForward** - Carry forward data from fast render (injected as **first context**)
5. **...requestedContexts** - Contexts specified via `withContexts()`

**Important:** 
- Services are not available in the interactive phase - only contexts
- Carry forward is injected as a **separate parameter** (not part of props)
- `viewStateSignals` provides reactive access to data from the fast render phase as `[getter, setter]` tuples

## Render Response Builders

### `phaseOutput<ViewState, CarryForward>`

Creates a successful phase render result with data to carry forward to the next phase:

```typescript
return phaseOutput(
  { name: 'Product Name', price: 99.99 }, // Rendered ViewState for this phase
  { productId: '123' }, // Carry forward data to next phase
);
```

**Note:** `partialRender` is still available as an alias for backward compatibility, but `phaseOutput` is the preferred name as it better reflects the three-phase rendering model.

### `serverError5xx(status)`

Creates a server error response:

```typescript
return serverError5xx(503); // Service Unavailable
```

### `clientError4xx(status)`

Creates a client error response:

```typescript
return clientError4xx(404); // Not Found
// or
return notFound();
```

### `redirect3xx(status, location)`

Creates a redirect response:

```typescript
return redirect3xx(301, 'https://new-domain.com/product');
```

## Data Flow

### Carry Forward Mechanism

Data flows between phases using the **carry forward** mechanism. Each phase can return data that's injected into subsequent phases:

```typescript
// Slow render: Return ViewState + CarryForward
.withSlowlyRender(async (props, service1, service2) => {
  const product = await getProduct(props.slug);
  
  return phaseOutput(
    { name: product.name, sku: product.sku },  // → SlowViewState
    { productId: product.id }                   // → Injected as first service in fast render
  );
})

// Fast render: Receive slow carry forward as FIRST SERVICE
.withFastRender(async (props, slowCarryForward, service1, service2) => {
  // slowCarryForward is injected as the first service parameter
  const inventory = await getInventory(slowCarryForward.productId);
  
  return phaseOutput(
    { inStock: inventory.available > 0 },       // → FastViewState (becomes signals)
    { productId: slowCarryForward.productId, stockLevel: inventory.available }  // → Injected as first context in interactive
  );
})

// Interactive: Receive fast carry forward as FIRST CONTEXT (after viewStateSignals)
.withInteractive((props, refs, viewStateSignals, fastCarryForward, context1, context2) => {
  // Parameter order:
  // 1. props (from withProps + URL params)
  // 2. refs (from contract)
  // 3. viewStateSignals (Signals<FastViewState>)
  // 4. fastCarryForward (first context - carry forward from fast render)
  // 5. context1, context2, ... (requested contexts via withContexts)
  
  const [getInStock, setInStock] = viewStateSignals.inStock;
  
  return {
    render: () => ({ 
      stockLevel: fastCarryForward.stockLevel,
      inStock: getInStock()
    }),
  };
})
```

**Key points:**

- **Slow → Fast**: Carry forward is injected as the **first service parameter** (before requested services)
- **Fast → Interactive**: Carry forward is injected as the **first context parameter** (after viewStateSignals, before requested contexts)
- **Carry forward ≠ Props**: Carry forward data does NOT become part of props - it's a separate injection parameter
- **ViewState → Signals**: Fast ViewState is converted to reactive signals and passed as `viewStateSignals` in interactive
- **Optimization**: Only carry forward what's needed (IDs, metadata), not entire objects

### Props Composition and Parameter Injection

Props remain constant across phases, while carry forward data is injected via different mechanisms:

```typescript
// Phase 1: Slow Render
function slowRender(
  props: PageProps & ProductParams,
  ...services
) {
  return phaseOutput(viewState, carryForward);
}

// Phase 2: Fast Render
function fastRender(
  props: PageProps & ProductParams,          // Same props as slow
  slowCarryForward: { productId: string },   // Injected as FIRST SERVICE
  ...requestedServices                        // Other services follow
) {
  return phaseOutput(viewState, carryForward);
}

// Phase 3: Interactive
function interactive(
  props: PageProps & ProductParams,                    // Same props as slow/fast
  refs: ComponentRefs,                                 // From contract
  viewStateSignals: Signals<FastViewState>,           // Fast ViewState as signals
  fastCarryForward: { productId: string; inStock: boolean },  // Injected as FIRST CONTEXT
  ...requestedContexts                                 // Other contexts follow
) {
  return { render: () => ({ ... }) };
}
```

**Key principles:**

1. **Props are stable**: The same props object flows through all phases (from `withProps()` + URL params)
2. **Carry forward is injected separately**:
   - In fast render: As the **first service** parameter
   - In interactive: As the **first context** parameter (after viewStateSignals)
3. **Services stay server-side**: Only available in slow and fast render
4. **Contexts are client-side**: Only available in interactive phase

### Service and Context Injection

#### Services (Server-Side)

Services are available in URL loading, slow render, and fast render phases:

```typescript
// Services in URL loader
async function* urlLoader(productsDb: ProductsDatabase): AsyncIterable<ProductParams[]> {
  const products = await productsDb.getAllProducts();
  yield products.map(({ slug }) => ({ slug }));
}

// Services in slow render
async function slowlyRender(
  props: ProductPageProps,
  productsDb: ProductsDatabase,
  auth: AuthService,
) {
  const user = await auth.getUser(props.userId);
  const data = await productsDb.getUserData(user.id);
  return phaseOutput({ data }, { userId: user.id });
}

// Services in fast render (carry forward is the FIRST service parameter)
async function fastRender(
  props: ProductPageProps,
  slowCarryForward: { userId: string },  // First parameter after props
  inventory: InventoryService,            // Then requested services
) {
  const status = await inventory.getStatus(slowCarryForward.userId);
  return phaseOutput({ status }, {});
}
```

#### Contexts (Client-Side)

Contexts are only available in the interactive phase. The parameter order for interactive components is:

1. **props** - From `withProps()` + URL params
2. **refs** - Interactive elements from contract
3. **viewStateSignals** - `Signals<FastViewState>` (reactive access to fast-phase data)
4. **fastCarryForward** - Carry forward data from fast render (injected as first context)
5. **...requestedContexts** - Contexts specified via `withContexts()`

```typescript
// Contexts in interactive component
function interactiveConstructor(
  props, 
  refs, 
  viewStateSignals,        // Signals<FastViewState>
  fastCarryForward,        // Carry forward from fast render (FIRST CONTEXT)
  theme: Theme,            // Requested contexts follow
  user: User
) {
  // viewStateSignals is Signals<FastViewState>
  // Each property is a [getter, setter] tuple
  const [getStatus, setStatus] = viewStateSignals.status;
  
  // Access carry forward data
  const productId = fastCarryForward.productId;
  
  const isDarkMode = theme.isDarkMode();
  const userPreferences = user.getPreferences();

  return {
    render: () => ({ 
      isDarkMode, 
      userPreferences,
      status: getStatus() // Access fast-phase data reactively
    }),
  };
}
```

**Important:** 

- **viewStateSignals**: Contains reactive signals (`[Getter, Setter]` tuples) for all properties rendered in the fast phase
  - Read fast-phase data reactively using the getter
  - Update fast-phase data using the setter (e.g., for optimistic updates)
  - Subscribe to changes in fast-phase data

- **fastCarryForward**: Injected as the **first context parameter** (after viewStateSignals), providing access to data carried forward from the fast render phase

## URL Parameter Loading

### Basic Parameter Loading

Load parameters for pages with dynamic routes:

```typescript
interface BlogPostParams extends UrlParams {
  slug: string;
}

async function* urlLoader(): AsyncIterable<BlogPostParams[]> {
  const posts = await getBlogPosts();
  yield posts.map(({ slug }) => ({ slug }));
}
```

### System Parameters

Load system-wide parameters like language:

```typescript
interface LocalizedParams extends UrlParams {
  lang: string;
}

async function* urlLoader(): AsyncIterable<LocalizedParams[]> {
  const languages = await getSupportedLanguages();
  yield languages.map((lang) => ({ lang }));
}
```

### Complex Parameter Loading

Load parameters with dependencies:

```typescript
interface ProductParams extends UrlParams {
  category: string;
  productId: string;
}

async function* urlLoader(): AsyncIterable<ProductParams[]> {
  const categories = await getCategories();

  for (const category of categories) {
    const products = await getProductsByCategory(category.id);
    yield products.map((product) => ({
      category: category.slug,
      productId: product.id,
    }));
  }
}
```

## Service Management

### Defining Services

Services are defined using `createJayService` and type markers:

```typescript
// src/services/products-database.ts
import { createJayService } from '@jay-framework/fullstack-component';

export interface ProductsDatabase {
  getAllProducts(): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  updateProduct(id: string, updates: Partial<Product>): Promise<void>;
}

export const PRODUCTS_DATABASE_SERVICE = createJayService<ProductsDatabase>('ProductsDatabase');
```

### Registering Services

Services are registered in the `src/jay.init.ts` file:

```typescript
// src/jay.init.ts
import {
  onInit,
  onShutdown,
  registerService,
  getService,
} from '@jay-framework/stack-server-runtime';
import { PRODUCTS_DATABASE_SERVICE, createProductsDatabase } from './services/products-database';
import { INVENTORY_SERVICE, createInventoryService } from './services/inventory';

onInit(async () => {
  // Initialize and register services
  const productsDb = await createProductsDatabase();
  registerService(PRODUCTS_DATABASE_SERVICE, productsDb);

  const inventory = await createInventoryService();
  registerService(INVENTORY_SERVICE, inventory);

  console.log('Services initialized');
});

onShutdown(async () => {
  // Clean up services
  const productsDb = getService(PRODUCTS_DATABASE_SERVICE);
  await productsDb.close();

  const inventory = getService(INVENTORY_SERVICE);
  await inventory.dispose();

  console.log('Services shut down');
});
```

The `src/jay.init.ts` file:

- Is automatically loaded by the dev server on startup
- Supports hot reload - services are reinitialized when the file changes
- Provides lifecycle hooks for initialization and cleanup
- Manages graceful shutdown in production
- Has full TypeScript support since it's in the `src/` directory

### Using Services in Pages

Once registered, services are injected into your page components:

```typescript
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { PRODUCTS_DATABASE_SERVICE } from './services/products-database';

export const page = makeJayStackComponent<PageContract>()
  .withServices(PRODUCTS_DATABASE_SERVICE)
  .withSlowlyRender(async (props, productsDb) => {
    const products = await productsDb.getAllProducts();
    return phaseOutput({ products }, {});
  });
```

## Context Management

### Client Contexts

Client contexts provide client-side state and services:

```typescript
// Define client context
const ThemeContext = createJayContext<Theme>();
const CartContext = createJayContext<Cart>();

// Use in interactive component
function interactiveConstructor(props, refs, viewStateSignals, fastCarryForward, theme, cart) {
  const [quantity, setQuantity] = createSignal(1);

  refs.addToCart.onclick(() => {
    cart.addItem({ productId: fastCarryForward.productId, quantity: quantity() });
  });

  return {
    render: () => ({
      quantity: quantity(),
      isDarkMode: theme.isDarkMode(),
      cartItemCount: cart.getItemCount(),
    }),
  };
}
```

## Error Handling

### Server Errors

Handle server-side errors gracefully:

```typescript
async function slowlyRender(props) {
  try {
    const product = await getProductBySlug(props.slug);

    if (!product) {
      return notFound();
    }

    return phaseOutput({ product }, { productId: product.id });
  } catch (error) {
    console.error('Failed to load product:', error);
    return serverError5xx(503);
  }
}
```

### Client Errors

Handle client-side errors:

```typescript
async function fastRender(props, slowCarryForward) {
  try {
    const inventory = await getInventoryStatus(slowCarryForward.productId);
    return phaseOutput({ inStock: inventory.available > 0 }, {});
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return clientError4xx(404);
    }
    return serverError5xx(500);
  }
}
```

### Error Boundaries

Create error boundaries for interactive components:

```typescript
function interactiveConstructor(props, refs) {
  const [hasError, setHasError] = createSignal(false);

  refs.retryButton.onclick(() => {
    setHasError(false);
    // Retry logic
  });

  return {
    render: () => ({ hasError: hasError() }),
  };
}
```

## Performance Optimization

### Partial Rendering

Only update the parts of the view state that change:

```typescript
// Slow render - static data
return phaseOutput({ name: product.name, sku: product.sku }, { productId: product.id });

// Fast render - only dynamic data (receives slowCarryForward as first service)
return phaseOutput(
  { inStock: inventory.available > 0 },
  { productId: slowCarryForward.productId, inStock: inventory.available > 0 },
);

// Interactive - only interactive data
return {
  render: () => ({ quantity: quantity() }),
};
```

### Carry Forward Optimization

Pass data between phases to avoid recomputation:

```typescript
// Slow render
const product = await getProductBySlug(props.slug);
return phaseOutput(
  { name: product.name, price: product.price },
  { productId: product.id, category: product.category },
);

// Fast render - use carried forward data (slowCarryForward is first service parameter)
const inventory = await getInventoryStatus(slowCarryForward.productId);
return phaseOutput(
  { inStock: inventory.available > 0 },
  { productId: slowCarryForward.productId, category: slowCarryForward.category },
);
```

### Caching

Implement caching for expensive operations:

```typescript
const productCache = new Map();

async function slowlyRender(props) {
  const cacheKey = `product:${props.slug}`;

  if (productCache.has(cacheKey)) {
    const cached = productCache.get(cacheKey);
    return phaseOutput(cached.data, cached.carryForward);
  }

  const product = await getProductBySlug(props.slug);
  const result = phaseOutput(
    { name: product.name, price: product.price },
    { productId: product.id },
  );

  productCache.set(cacheKey, {
    data: result.rendered,
    carryForward: result.carryForward,
  });

  return result;
}
```

## Advanced Patterns

### Conditional Rendering

Render different content based on conditions:

```typescript
async function slowlyRender(props) {
  if (props.userId) {
    // Authenticated user
    const user = await getUser(props.userId);
    const personalizedData = await getPersonalizedData(user.id);

    return phaseOutput({ user, personalizedData }, { userId: user.id, isAuthenticated: true });
  } else {
    // Anonymous user
    const publicData = await getPublicData();

    return phaseOutput({ publicData }, { isAuthenticated: false });
  }
}
```

### Dynamic Imports

Load components dynamically based on data:

```typescript
async function fastRender(props, slowCarryForward) {
  const componentType = await getComponentType(slowCarryForward.productId);

  if (componentType === 'video') {
    return phaseOutput(
      { componentType, videoUrl: await getVideoUrl(slowCarryForward.productId) },
      { componentType },
    );
  } else {
    return phaseOutput(
      { componentType, imageUrl: await getImageUrl(slowCarryForward.productId) },
      { componentType },
    );
  }
}
```

### Progressive Enhancement

Enhance functionality progressively:

```typescript
function interactiveConstructor(props, refs) {
  // Basic functionality
  const [quantity, setQuantity] = createSignal(1);

  // Enhanced functionality (if supported)
  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Load additional data
        }
      });
    });

    observer.observe(refs.container);
  }

  return {
    render: () => ({ quantity: quantity() }),
  };
}
```

## Testing

### Unit Testing

Test individual rendering functions:

```typescript
import { describe, it, expect } from 'vitest';

describe('Product Page', () => {
  it('should render product data', async () => {
    const props = { slug: 'test-product' };
    const result = await slowlyRender(props);

    expect(result.viewState.name).toBe('Test Product');
    expect(result.carryForward.productId).toBe('123');
  });

  it('should handle missing product', async () => {
    const props = { slug: 'missing-product' };
    const result = await slowlyRender(props);

    expect(result.status).toBe(404);
  });
});
```

### Integration Testing

Test the full component lifecycle:

```typescript
describe('Product Page Component', () => {
  it('should handle full rendering cycle', async () => {
    const component = makeJayStackComponent<ProductContract>()
      .withProps<ProductPageProps>()
      .withSlowlyRender(slowlyRender)
      .withFastRender(fastRender)
      .withInteractive(interactive);

    // Test slow render
    const slowResult = await component.slowlyRender({ slug: 'test' });
    expect(slowResult.viewState.name).toBe('Test Product');

    // Test fast render
    const fastResult = await component.fastRender({
      slug: 'test',
      productId: '123',
    });
    expect(fastResult.viewState.inStock).toBe(true);
  });
});
```

## Best Practices

### 1. Separate Concerns

Keep rendering functions focused:

```typescript
// Good - focused functions
async function slowlyRender(props) {
  const product = await getProduct(props.slug);
  return phaseOutput({ product }, { productId: product.id });
}

async function fastRender(props, slowCarryForward) {
  const inventory = await getInventory(slowCarryForward.productId);
  return phaseOutput({ inventory }, { productId: slowCarryForward.productId });
}

// Avoid - doing too much in one function
async function renderEverything(props) {
  const product = await getProduct(props.slug);
  const inventory = await getInventory(product.id);
  const reviews = await getReviews(product.id);
  const recommendations = await getRecommendations(product.id);

  return phaseOutput({ product, inventory, reviews, recommendations }, {});
}
```

### 2. Handle Loading States

Provide loading states for better UX:

```typescript
async function fastRender(props, slowCarryForward) {
  const inventory = await getInventory(slowCarryForward.productId);

  return phaseOutput(
    {
      inStock: inventory.available > 0,
      isLoading: false,
    },
    { productId: slowCarryForward.productId },
  );
}

function interactiveConstructor(props, refs, viewStateSignals, fastCarryForward) {
  const [isAddingToCart, setIsAddingToCart] = createSignal(false);

  refs.addToCart.onclick(async () => {
    setIsAddingToCart(true);
    try {
      await addToCart({ productId: fastCarryForward.productId, quantity: 1 });
    } finally {
      setIsAddingToCart(false);
    }
  });

  return {
    render: () => ({ isAddingToCart: isAddingToCart() }),
  };
}
```

### 3. Optimize Data Loading

Load only necessary data in each phase:

```typescript
// Slow render - only static data
async function slowlyRender(props) {
  const product = await getProductBasicInfo(props.slug);
  return phaseOutput({ product }, { productId: product.id });
}

// Fast render - dynamic data
async function fastRender(props, slowCarryForward) {
  const [inventory, price] = await Promise.all([
    getInventory(slowCarryForward.productId),
    getCurrentPrice(slowCarryForward.productId),
  ]);

  return phaseOutput({ inventory, price }, { productId: slowCarryForward.productId });
}
```

### 4. Use Type Safety

Leverage TypeScript for type safety:

```typescript
interface ProductPageProps {
  userId?: string;
}

interface ProductParams extends UrlParams {
  slug: string;
}

interface SlowRenderCarryForward {
  productId: string;
}

interface FastRenderCarryForward {
  productId: string;
  inStock: boolean;
}

async function slowlyRender(
  props: ProductPageProps & ProductParams,
): Promise<PartialRender<ProductViewState, SlowRenderCarryForward> | ServerError5xx> {
  // TypeScript ensures type safety
}
```

## Next Steps

Now that you understand Jay Stack components:

1. **Build Your First Full-Stack App** - Apply these concepts to a real application
2. **Learn Advanced Patterns** - Explore complex rendering scenarios
3. **Master Performance** - Optimize your applications for speed
4. **Explore Examples** - See real-world full-stack patterns

---

Ready to build your first full-stack application? Check out the [Examples](../examples/) section for working patterns!
