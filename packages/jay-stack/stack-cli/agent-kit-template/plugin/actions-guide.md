# Server Actions

Actions provide RPC-style server endpoints for client-to-server communication.

## makeJayAction — Mutations (POST)

```typescript
import { makeJayAction } from '@jay-framework/fullstack-component';

export const addToCart = makeJayAction('cart.addToCart')
  .withServices(CART_SERVICE)
  .withHandler(async (input: { productId: string; quantity: number }, cartService) => {
    const cart = await cartService.addItem(input.productId, input.quantity);
    return { cartItemCount: cart.items.length };
  });
```

## makeJayQuery — Reads (GET)

Queries use GET and support caching:

```typescript
import { makeJayQuery } from '@jay-framework/fullstack-component';

export const searchProducts = makeJayQuery('products.search')
  .withServices(PRODUCTS_SERVICE)
  .withCaching({ maxAge: 60 })
  .withHandler(async (input: { query: string; page?: number }, productsDb) => {
    const results = await productsDb.search(input.query, input.page);
    return { products: results.items, totalCount: results.total };
  });
```

## Builder API

```typescript
makeJayAction('name')
  .withServices(SERVICE1, SERVICE2) // Inject services
  .withMethod('PUT') // Override HTTP method (default: POST for actions)
  .withCaching({ maxAge: 60 }) // Enable caching (queries only)
  .withHandler(async (input, svc1, svc2) => {
    // Define handler
    return result;
  });
```

## ActionError

Throw typed errors from action handlers:

```typescript
import { ActionError } from '@jay-framework/fullstack-component';

throw new ActionError('OUT_OF_STOCK', 'Only 2 units available');
throw new ActionError('INVALID_INPUT', 'Product ID is required');
```

## Calling Actions from Client

Actions are callable functions on the client:

```typescript
.withInteractive(function MyComp(props, refs) {
    refs.addToCart.onClick(async () => {
        const result = await addToCart({
            productId: props.productId,
            quantity: 1,
        });
        // result.cartItemCount
    });
})
```

## Calling Actions from Server

When called from server-side code (e.g., within a render phase), services are automatically injected — no network call is made.

## .jay-action Metadata Files

Each action should have a `.jay-action` file describing its input/output schemas for agent discovery:

```yaml
name: searchProducts
description: Search products with text, filters, sorting, and pagination

import:
  productCard: product-card.jay-contract

inputSchema:
  query: string
  filters?:
    inStockOnly?: boolean
    minPrice?: number
    maxPrice?: number
  sortBy?: enum(relevance | price_asc | price_desc)
  pageSize?: number

outputSchema:
  products:
    - productCard
  totalCount: number
  hasMore: boolean
```

### Jay-Type Notation for Schemas

| Notation                  | Meaning                   |
| ------------------------- | ------------------------- |
| `prop: string`            | Required string           |
| `prop?: number`           | Optional number           |
| `prop: boolean`           | Required boolean          |
| `prop: enum(a \| b \| c)` | Required enum             |
| `prop:` + nested block    | Nested object             |
| `prop:` + `- child: type` | Array of objects          |
| `prop: record(T)`         | Record with typed values  |
| `prop: importedName`      | Type from `import:` block |

## makeJayStream — Streaming (POST, NDJSON)

Streaming actions return an async generator that yields chunks:

```typescript
import { makeJayStream } from '@jay-framework/fullstack-component';

export const discoverParams = makeJayStream('routes.discoverParams')
  .withServices(PRODUCTS_SERVICE)
  .withHandler(async function* (input: { route: string }, productsService) {
    let page = 1;
    while (true) {
      const products = await productsService.list({ page, pageSize: 100 });
      yield products.map(p => ({ slug: p.slug }));
      if (!products.hasMore) break;
      page++;
    }
  });
```

### Consuming on the client

```typescript
for await (const batch of discoverParams({ route: '/products/[slug]' })) {
  console.log(batch); // [{ slug: 'item-a' }, { slug: 'item-b' }]
}
```

### Wire format

The server responds with NDJSON (newline-delimited JSON). Each line is a complete JSON object:

```
{"chunk":[{"slug":"item-a"},{"slug":"item-b"}]}
{"chunk":[{"slug":"item-c"}]}
{"done":true}
```

### .jay-action for streaming

Add `streaming: true` to the metadata file:

```yaml
name: discoverParams
description: Discover URL params by querying the product catalog
streaming: true
inputSchema:
  route: string
outputSchema:
  - slug: string
```

## Type Helpers

```typescript
import {
  ActionInput, ActionOutput, isJayAction,
  StreamChunk, isJayStreamAction,
} from '@jay-framework/fullstack-component';

type SearchInput = ActionInput<typeof searchProducts>;
type SearchOutput = ActionOutput<typeof searchProducts>;
type ParamBatch = StreamChunk<typeof discoverParams>;
```
