# Component Structure

Full-stack components use `makeJayStackComponent` with a fluent builder API and three rendering phases.

## Basic Structure

```typescript
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { MyContract } from './my-contract.generated';

export const myComponent = makeJayStackComponent<MyContract>()
  .withSlowlyRender(async (props) => {
    const data = await fetchStaticData();
    return phaseOutput(
      { title: data.title, description: data.description }, // ViewState
      { productId: data.id }, // CarryForward
    );
  })
  .withFastRender(async (props) => {
    return phaseOutput({ price: await getPrice(), inStock: true }, {});
  })
  .withInteractive(function MyComponent(props, refs) {
    // Client-side hooks here
    return { render: () => ({}) };
  });
```

## Builder API

### `.withProps<T>()`

Declare the props type (must match contract `props`):

```typescript
makeJayStackComponent<MyContract>().withProps<{ productId: string; currency?: string }>();
```

### `.withServices(...markers)`

Inject server-side services:

```typescript
.withServices(DATABASE_SERVICE, CACHE_SERVICE)
.withSlowlyRender(async (props, db, cache) => {
    // db and cache are injected
})
```

### `.withContexts(...markers)`

Consume client-side contexts in the interactive phase:

```typescript
.withContexts(CART_CONTEXT)
.withInteractive(function MyComp(props, refs, cartCtx) {
    // cartCtx available in interactive phase
})
```

### `.withLoadParams(fn)`

Generate URL params for SSG (static site generation). Returns an async iterable of param arrays:

```typescript
.withLoadParams(async function* (db) {
    const products = await db.getAllProducts();
    yield products.map(p => ({ slug: p.slug }));
})
```

### `.withSlowlyRender(fn)` — Build-time rendering

Runs during SSG. Has access to props and services. Returns `phaseOutput(viewState, carryForward)`.

CarryForward data is passed to the fast phase but not included in the ViewState.

```typescript
.withSlowlyRender(async (props, db) => {
    const product = await db.getProduct(props.slug);
    if (!product) return notFound('Product not found');
    return phaseOutput(
        { title: product.name, description: product.desc },
        { productId: product.id },  // Available in fast phase
    );
})
```

### `.withFastRender(fn)` — Request-time rendering

Runs on each request. Receives props (including `query` for query parameters) and carry-forward from slow phase.

```typescript
.withFastRender(async (props, db) => {
    const price = await db.getPrice(props.carryForward.productId);
    return phaseOutput({ price, inStock: price > 0 }, {});
})
```

### `.withClientDefaults(fn)` — Defaults for dynamically created forEach items

Required only when the component is used inside a `forEach` where new items can be added on the client. When a user adds a new item to a forEach array, the new instance has no server data — `withClientDefaults` provides the initial ViewState.

```typescript
.withClientDefaults((props) => ({
    viewState: { label: `Item ${props.itemId}`, value: 0 },
    carryForward: {},
}))
```

**When to use:** Component inside `forEach` + items can be added client-side.
**When NOT to use:** Components outside forEach, or forEach with server-only items. Use `withFastRender` instead for SSR initial state.

### `.withInteractive(ComponentConstructor)` — Client-side logic

The interactive phase runs in the browser. Use hooks here (see component-state.md):

```typescript
.withInteractive(function ProductPage(props, refs) {
    const [quantity, setQuantity] = createSignal(1);

    refs.addToCart.onClick(() => {
        addToCartAction({ productId: props.productId, quantity: quantity() });
    });

    return {
        render: () => ({
            quantity: quantity(),
        }),
    };
})
```

## Render Return Types

Each phase can return:

- `phaseOutput(viewState, carryForward)` — success
- `notFound()`, `badRequest()`, `unauthorized()`, `forbidden()` — client errors
- `serverError5xx(status, message)` — server errors
- `redirect3xx(status, location)` — redirects

See [render-results.md](render-results.md) for details.

## Props and Contract Alignment

The component's props type must match the contract's `props` section:

```yaml
# Contract
props:
  - name: productId
    type: string
    required: true
```

```typescript
// Component
makeJayStackComponent<MyContract>().withProps<{ productId: string }>();
```

## Params and Contract Alignment

If the contract has `params`, the component should use `withLoadParams` and the route must have matching dynamic segments:

```yaml
# Contract
params:
  slug: string
```

```typescript
// Component
.withLoadParams(async function* (db) {
    const items = await db.getAll();
    yield items.map(i => ({ slug: i.slug }));
})
```
