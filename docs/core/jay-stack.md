# Jay Stack Components

Jay Stack components enable you to build full-stack applications with server-side rendering, client-side interactivity, and seamless data flow between server and client.

## Overview

Jay Stack components provide:

- **Three-Phase Rendering** - Slow (SSG), Fast (SSR), and Interactive (CSR)
- **Server-Side Rendering** - SEO-friendly, fast initial loads
- **Client-Side Interactivity** - Reactive state management
- **Type Safety** - Full TypeScript support with generated contracts
- **Context Support** - Server and client context injection
- **URL Parameter Loading** - Dynamic routing with parameter handling

## Rendering Phases

Jay Stack implements three distinct rendering phases for optimal performance:

### 1. Slow Rendering (Build Time)

**Purpose**: Static data and pre-rendering
**When**: Build time or data change time
**Output**: Pre-rendered HTML with static data

```typescript
.withSlowlyRender(async (props, ...contexts) => {
  // Load static data that doesn't change often
  const product = await getProductBySlug(props.slug);

  return partialRender(
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
.withFastRender(async (props, ...contexts) => {
  // Load dynamic data that can change
  const inventory = await getInventoryStatus(props.productId);

  return partialRender(
    { inStock: inventory.available > 0 },
    { productId: props.productId, inStock: inventory.available > 0 }
  );
})
```

### 3. Interactive Rendering (Client Time)

**Purpose**: Client-side interactivity
**When**: User interaction
**Output**: Reactive UI updates

```typescript
.withInteractive((props, refs) => {
  const [quantity, setQuantity] = createSignal(1);

  refs.addToCart.onclick(() => {
    addToCart({ productId: props.productId, quantity: quantity() });
  });

  return {
    render: () => ({ quantity: quantity() }),
  };
})
```

## Component Builder API

Jay Stack uses a fluent builder API for creating full-stack components:

```typescript
import { makeJayStackComponent, partialRender } from 'jay-fullstack-component';

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withServerContext(DatabaseContext, AuthContext)
  .withClientContext(ThemeContext, UserContext)
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

#### `.withServerContext(...contextMarkers)`

Adds server-side context markers for dependency injection:

```typescript
const DatabaseContext = createJayContext<Database>();
const AuthContext = createJayContext<AuthService>();

makeJayStackComponent<ProductContract>().withServerContext(DatabaseContext, AuthContext);
```

#### `.withClientContext(...contextMarkers)`

Adds client-side context markers for dependency injection:

```typescript
const ThemeContext = createJayContext<Theme>();
const UserContext = createJayContext<User>();

makeJayStackComponent<ProductContract>().withClientContext(ThemeContext, UserContext);
```

#### `.withLoadParams(loadParams)`

Defines how URL parameters are loaded and converted to props:

```typescript
interface ProductParams extends UrlParams {
  slug: string;
}

async function* urlLoader(): AsyncIterable<ProductParams[]> {
  const products = await getProducts();
  yield products.map(({ slug }) => ({ slug }));
}

makeJayStackComponent<ProductContract>().withLoadParams(urlLoader);
```

#### `.withSlowlyRender(slowlyRender)`

Defines the slow rendering function for semi-static data:

```typescript
async function slowlyRender(props: ProductPageProps & ProductParams) {
  const product = await getProductBySlug(props.slug);

  return partialRender(
    {
      name: product.name,
      sku: product.sku,
      price: product.price,
    },
    { productId: product.id },
  );
}

makeJayStackComponent<ProductContract>().withSlowlyRender(slowlyRender);
```

#### `.withFastRender(fastRender)`

Defines the fast rendering function for dynamic data:

```typescript
async function fastRender(props: ProductPageProps & ProductParams & { productId: string }) {
  const inventory = await getInventoryStatus(props.productId);

  return partialRender(
    { inStock: inventory.available > 0 },
    { productId: props.productId, inStock: inventory.available > 0 },
  );
}

makeJayStackComponent<ProductContract>().withFastRender(fastRender);
```

#### `.withInteractive(componentConstructor)`

Defines the client-side interactive component:

```typescript
function interactiveConstructor(
  props: ProductPageProps & ProductParams & { productId: string; inStock: boolean },
  refs,
) {
  const [quantity, setQuantity] = createSignal(1);

  refs.addToCart.onclick(() => {
    addToCart({ productId: props.productId, quantity: quantity() });
  });

  return {
    render: () => ({ quantity: quantity() }),
  };
}

makeJayStackComponent<ProductContract>().withInteractive(interactiveConstructor);
```

## Render Response Builders

### `partialRender<ViewState, CarryForward>`

Creates a successful partial render result with data to carry forward:

```typescript
return partialRender(
  { name: 'Product Name', price: 99.99 }, // View state
  { productId: '123' }, // Carry forward data
);
```

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

### Props Composition

Props are composed across rendering phases:

```typescript
// Phase 1: Slow Render
props: PageProps & ProductParams;

// Phase 2: Fast Render
props: PageProps & ProductParams & SlowRenderCarryForward;

// Phase 3: Interactive
props: PageProps & ProductParams & FastRenderCarryForward;
```

### Context Injection

Contexts are available in all rendering phases:

```typescript
// Server contexts in slow and fast render
async function slowlyRender(props, database, auth) {
  const user = await auth.getUser(props.userId);
  const data = await database.getData(user.id);
  return partialRender({ data }, { userId: user.id });
}

// Client contexts in interactive
function interactiveConstructor(props, refs, theme, user) {
  const isDarkMode = theme.isDarkMode();
  const userPreferences = user.getPreferences();

  return {
    render: () => ({ isDarkMode, userPreferences }),
  };
}
```

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

## Context Management

### Server Contexts

Server contexts provide services and data access:

```typescript
// Define server context
const DatabaseContext = createJayContext<Database>();
const AuthContext = createJayContext<AuthService>();

// Use in rendering functions
async function slowlyRender(props, database, auth) {
  const user = await auth.getUser(props.userId);
  const data = await database.getUserData(user.id);

  return partialRender({ data }, { userId: user.id });
}
```

### Client Contexts

Client contexts provide client-side state and services:

```typescript
// Define client context
const ThemeContext = createJayContext<Theme>();
const CartContext = createJayContext<Cart>();

// Use in interactive component
function interactiveConstructor(props, refs, theme, cart) {
  const [quantity, setQuantity] = createSignal(1);

  refs.addToCart.onclick(() => {
    cart.addItem({ productId: props.productId, quantity: quantity() });
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

    return partialRender({ product }, { productId: product.id });
  } catch (error) {
    console.error('Failed to load product:', error);
    return serverError5xx(503);
  }
}
```

### Client Errors

Handle client-side errors:

```typescript
async function fastRender(props) {
  try {
    const inventory = await getInventoryStatus(props.productId);
    return partialRender({ inStock: inventory.available > 0 });
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
return partialRender({ name: product.name, sku: product.sku }, { productId: product.id });

// Fast render - only dynamic data
return partialRender(
  { inStock: inventory.available > 0 },
  { productId: props.productId, inStock: inventory.available > 0 },
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
return partialRender(
  { name: product.name, price: product.price },
  { productId: product.id, category: product.category },
);

// Fast render - use carried forward data
const inventory = await getInventoryStatus(props.productId);
return partialRender(
  { inStock: inventory.available > 0 },
  { productId: props.productId, category: props.category },
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
    return partialRender(cached.data, cached.carryForward);
  }

  const product = await getProductBySlug(props.slug);
  const result = partialRender(
    { name: product.name, price: product.price },
    { productId: product.id },
  );

  productCache.set(cacheKey, {
    data: result.viewState,
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

    return partialRender({ user, personalizedData }, { userId: user.id, isAuthenticated: true });
  } else {
    // Anonymous user
    const publicData = await getPublicData();

    return partialRender({ publicData }, { isAuthenticated: false });
  }
}
```

### Dynamic Imports

Load components dynamically based on data:

```typescript
async function fastRender(props) {
  const componentType = await getComponentType(props.productId);

  if (componentType === 'video') {
    return partialRender(
      { componentType, videoUrl: await getVideoUrl(props.productId) },
      { componentType },
    );
  } else {
    return partialRender(
      { componentType, imageUrl: await getImageUrl(props.productId) },
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
  return partialRender({ product }, { productId: product.id });
}

async function fastRender(props) {
  const inventory = await getInventory(props.productId);
  return partialRender({ inventory }, { productId: props.productId });
}

// Avoid - doing too much in one function
async function renderEverything(props) {
  const product = await getProduct(props.slug);
  const inventory = await getInventory(product.id);
  const reviews = await getReviews(product.id);
  const recommendations = await getRecommendations(product.id);

  return partialRender({ product, inventory, reviews, recommendations });
}
```

### 2. Handle Loading States

Provide loading states for better UX:

```typescript
async function fastRender(props) {
  const inventory = await getInventory(props.productId);

  return partialRender(
    {
      inStock: inventory.available > 0,
      isLoading: false,
    },
    { productId: props.productId },
  );
}

function interactiveConstructor(props, refs) {
  const [isAddingToCart, setIsAddingToCart] = createSignal(false);

  refs.addToCart.onclick(async () => {
    setIsAddingToCart(true);
    try {
      await addToCart({ productId: props.productId, quantity: 1 });
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
  return partialRender({ product }, { productId: product.id });
}

// Fast render - dynamic data
async function fastRender(props) {
  const [inventory, price] = await Promise.all([
    getInventory(props.productId),
    getCurrentPrice(props.productId),
  ]);

  return partialRender({ inventory, price }, { productId: props.productId });
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
