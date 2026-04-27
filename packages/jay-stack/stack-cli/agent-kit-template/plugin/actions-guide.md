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
  .withFiles({ maxFileSize: 5_000_000 }) // Accept file uploads (multipart/form-data)
  .withHandler(async (input, svc1, svc2) => {
    // Define handler
    return result;
  });
```

## .withFiles() — File Uploads

Actions can receive binary files (images, documents, etc.) via multipart/form-data.
Add `.withFiles()` to the builder chain to enable file uploads.

```typescript
import { makeJayAction, type JayFile } from '@jay-framework/fullstack-component';
import fs from 'fs';

export const uploadPhoto = makeJayAction('photos.upload')
  .withFiles({ maxFileSize: 5 * 1024 * 1024 }) // 5MB limit, 10 files max (default)
  .withHandler(async (input: { caption: string; photo: JayFile }) => {
    // JayFile provides: name, type, size, path (temp file on disk)
    const data = fs.readFileSync(input.photo.path);
    // Process file...
    return { fileName: input.photo.name, size: input.photo.size };
    // Temp file is automatically cleaned up after handler returns
  });
```

### JayFile type

```typescript
interface JayFile {
  name: string; // Original filename
  type: string; // MIME type (e.g., 'image/png')
  size: number; // File size in bytes
  path: string; // Absolute path to temp file on disk
}
```

### Multiple files

Use an array type for the field — files with the same field name are grouped:

```typescript
.withHandler(async (input: { images: JayFile[] }) => {
    for (const img of input.images) {
      // Process each file
    }
});
```

### Streaming with files

`makeJayStream` also supports `.withFiles()`:

```typescript
export const processImages = makeJayStream('images.process')
  .withFiles()
  .withHandler(async function* (input: { images: JayFile[] }) {
    for (const img of input.images) {
      yield { step: 'processing', fileName: img.name };
    }
    yield { step: 'done' };
  });
```

### Client-side usage

The client automatically sends `FormData` when `File` or `Blob` objects are present:

```typescript
refs.uploadBtn.onClick(async () => {
  const fileInput = refs.fileInput.element as HTMLInputElement;
  const file = fileInput.files?.[0];
  const result = await uploadPhoto({ caption: 'My photo', photo: file });
});
```

### FileUploadOptions

```typescript
.withFiles()                                       // Defaults: 10MB per file, 10 files max
.withFiles({ maxFileSize: 2 * 1024 * 1024 })       // 2MB limit
.withFiles({ maxFileSize: 20_000_000, maxFiles: 5 }) // 20MB, 5 files
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
| `prop: file`              | File upload (`JayFile`)   |
| `prop: file[]`            | Multiple file uploads     |
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
      yield products.map((p) => ({ slug: p.slug }));
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

### .jay-action for file uploads

Use `file` type for upload fields. The generated TypeScript uses `JayFile`:

```yaml
name: uploadPhoto
description: Upload a product photo with caption
inputSchema:
  caption: string
  photo: file
  attachments?: file[]
outputSchema:
  fileId: string
  message: string
```

## Type Helpers

```typescript
import {
  ActionInput,
  ActionOutput,
  isJayAction,
  StreamChunk,
  isJayStreamAction,
} from '@jay-framework/fullstack-component';

type SearchInput = ActionInput<typeof searchProducts>;
type SearchOutput = ActionOutput<typeof searchProducts>;
type ParamBatch = StreamChunk<typeof discoverParams>;
```
