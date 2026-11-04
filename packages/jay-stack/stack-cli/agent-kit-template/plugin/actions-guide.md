# Server Actions

Actions provide RPC-style server endpoints for client-to-server communication.

> **Actions are compiler-free and live on the `.` entry.** They run in production, so their handlers
> must not import the compiler (`@jay-framework/compiler-*`). A handler that needs the compiler is
> either a [CLI command](commands-guide.md) or a **`devOnly` action** (see below) — not a regular
> action. `validate-plugin`'s leak scan fails a compiler import in `dist/index.js`.
>
> **`devOnly` actions** (`actions[].devOnly: true`) — browser-callable handlers for settings/admin
> pages that may use the compiler and are **excluded from production**. Their handlers live in the
> `./tools` entry (`lib/tools.ts`), and the dev server registers them normally. See the settings-page
> pattern in [plugin-routes.md](plugin-routes.md).

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
  .withFiles() // Accept file uploads (multipart/form-data)
  .withRequest() // Receive the caller's cookies as argument 2 (see below)
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
  .withFiles()
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

**File fields must be top-level properties** — not nested inside objects. Dynamic file fields via index signatures are supported:

```typescript
{ notes: string; screenshot: JayFile; extras: JayFile[] }           // OK
{ notes: string; [key: string]: string | JayFile | undefined }      // OK
{ meta: { photo: JayFile } }                                        // NOT supported
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

## .withRequest() — Reading the Caller's Cookies

Opt in with `.withRequest()` and the handler receives an `ActionRequest` as its **second** argument, before the services:

```typescript
import { makeJayAction, ActionError } from '@jay-framework/fullstack-component';

export const updateAccount = makeJayAction('account.update')
  .withServices(ACCOUNT_SERVICE)
  .withRequest()
  .withHandler(async (input: { name: string }, request, account) => {
    const session = request.cookies.session; // server-trusted, includes HttpOnly cookies
    if (!session) throw new ActionError('UNAUTHORIZED', 'Not signed in');
    return account.update(session, input.name);
  });
```

Without `.withRequest()`, the handler is `(input, ...services)` as before. The client call is always `action(input)`.

Rules:

- **Identity comes from `request.cookies`, never from `input`.** Input is client-controlled and spoofable.
- **No `.withCaching()`.** A cookie-reading handler is per-user. Combining both throws when the action is defined. Every response of a `.withRequest()` action is sent with `Cache-Control: private, no-store`.
- **A GET query (`makeJayQuery`) must not mutate.** Only non-GET actions are protected by the same-origin check.
- **Non-GET calls must come from the same origin.** A cross-site browser request (by `Sec-Fetch-Site`, or `Origin` when that header is absent) is rejected with 403 `CROSS_ORIGIN_REQUEST` before the handler runs. Jay's client always calls same-origin. Requests with neither header (server-to-server, curl) are allowed.
- **Direct server-side calls get no cookies.** Calling a `.withRequest()` action directly (from another handler, a render phase, or the CLI) passes `{ cookies: {} }`. To act for the same caller, put the logic in a shared function and pass `request` to it explicitly.

### Setting cookies (login, refresh, logout)

Page JS cannot write an HttpOnly credential, so credential cookies are set by an action:

```typescript
export const login = makeJayAction('account.login')
  .withServices(AUTH_SERVICE)
  .withRequest()
  .withHandler(async (input: { email: string; password: string }, request, auth) => {
    const token = await auth.signIn(input.email, input.password);
    request.setCookie('session', token, { maxAge: 60 * 60 * 24 * 30 });
    return { ok: true };
  });

export const logout = makeJayAction('account.logout')
  .withRequest()
  .withHandler(async (input: {}, request) => {
    request.clearCookie('session'); // same path/domain as when it was set
    return { ok: true };
  });
```

- **Defaults:** `httpOnly: true`, `sameSite: 'Lax'`, `path: '/'`, and `secure` when the request is https (including `x-forwarded-proto: https`). Options: `httpOnly`, `secure`, `sameSite` (`'Strict' | 'Lax' | 'None'`; `'None'` forces `secure`), `path`, `domain`, `maxAge` (seconds), `expires`.
- **Cookies are sent only on success.** If the handler throws (including `ActionError`), cookies it set are discarded. To clear a cookie on failure, return a success value that says so.
- **`clearCookie` must use the same `path` and `domain`** the cookie was set with, or the browser keeps the original.
- Setting the same name twice keeps the last write. Cookie names must be RFC 6265 tokens.
- **Streams cannot set cookies.** `makeJayStream(...).withRequest()` gives a read-only `StreamActionRequest` (`request.cookies` only), because headers are sent before the generator runs.
- **Direct calls cannot set cookies.** There is no HTTP response; the cookie is discarded with a warning.

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

For dynamic file fields, use `record(file)`:

```yaml
name: submitTask
description: Submit task with named file attachments
inputSchema:
  notes: string
  files: record(file)
```

This generates `files: Record<string, JayFile>`.

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
