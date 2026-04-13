# Services and Initialization

Services provide dependency injection for server-side resources (databases, APIs, etc.).

## createJayService

Create a typed service marker:

```typescript
import { createJayService } from '@jay-framework/fullstack-component';

export interface ProductsDatabase {
  getProduct(slug: string): Promise<Product | null>;
  search(query: string): Promise<Product[]>;
}

export const PRODUCTS_DB = createJayService<ProductsDatabase>('ProductsDatabase');
```

The marker is a Symbol-based key — it provides type safety without coupling to a specific implementation.

## makeJayInit

Initialize services and client-side state during app startup:

### Server-only init

```typescript
import { makeJayInit, registerService } from '@jay-framework/fullstack-component';

export const init = makeJayInit().withServer(async () => {
  const db = await connectToDatabase();
  registerService(PRODUCTS_DB, db);
});
```

### Server + Client init

The server can pass data to the client via the return value:

```typescript
export const init = makeJayInit()
  .withServer(async () => {
    registerService(PRODUCTS_DB, await connectDb());
    return { currency: 'USD', storeId: 'store-123' };
  })
  .withClient((data) => {
    // data is typed: { currency: string; storeId: string }
    registerReactiveGlobalContext(STORE_CONFIG, () => ({
      currency: data.currency,
      storeId: data.storeId,
    }));
  });
```

### Client-only init

```typescript
export const init = makeJayInit().withClient(() => {
  initAnalytics();
});
```

## Using Services

### In Components

```typescript
makeJayStackComponent<MyContract>()
  .withServices(PRODUCTS_DB)
  .withSlowlyRender(async (props, db) => {
    const product = await db.getProduct(props.slug);
    return phaseOutput({ title: product.name }, {});
  });
```

### In Actions

```typescript
makeJayAction('products.search')
  .withServices(PRODUCTS_DB)
  .withHandler(async (input, db) => {
    return db.search(input.query);
  });
```

### In loadParams

```typescript
.withServices(PRODUCTS_DB)
.withLoadParams(async function* (db) {
    const products = await db.getAll();
    yield products.map(p => ({ slug: p.slug }));
})
```

## Service Lifecycle

- Services are registered during `makeJayInit().withServer()` callbacks
- Registration order follows plugin dependency order
- Services are available to all components and actions after init
- Services are server-side only — they are not sent to the client
