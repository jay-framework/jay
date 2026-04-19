# Design Log #129 — Streaming Actions (Generator Support)

## Background

Jay actions (`makeJayAction` / `makeJayQuery`) currently support a request-response model: the client sends input, the server handler returns a single `Promise<Output>`, and the client receives the result.

Some use cases require multiple responses from a single request — streaming results as they become available. Examples:

- **`loadRouteParams`**: a generator that yields batches of URL params as they're discovered from an API (e.g., paginated product listings)
- **AI agent chat**: streaming tokens from an LLM response
- **Search with progressive refinement**: results arriving as different data sources respond
- **Long-running operations**: progress updates during build/deploy

Related design logs: #63 (server actions), #82 (auto service injection), #128 (page freeze — `loadRouteParams` via editor protocol).

## Problem

The current action system is strictly request → response:

```typescript
// Current: single response
export const searchProducts = makeJayAction('products.search')
    .withHandler(async (input) => {
        const results = await db.search(input.query);
        return results; // Single response
    });
```

For `loadRouteParams`, we worked around this by adding a custom editor protocol message with socket events. But this pattern doesn't generalize — each streaming use case would need its own protocol extension.

### Current `loadRouteParams` workaround

```
Client → { type: 'loadRouteParams', route: '/products/[slug]' }
Server → { type: 'loadRouteParams', success: true }  // Ack
Server → emit('routeParamsBatch', { params: [...], hasMore: true })  // Event
Server → emit('routeParamsBatch', { params: [...], hasMore: true })  // Event
Server → emit('routeParamsBatch', { params: [], hasMore: false })    // Done
```

This works but requires protocol-level extensions for each streaming case.

## Questions

1. **Q: Should streaming actions use HTTP (SSE/chunked transfer) or WebSocket?**

   **A:** Plain HTTP with chunked transfer encoding. A single HTTP request, single response — but the response body is written incrementally as the generator yields. The client reads chunks one by one. This is simpler than SSE/WebSocket, works through proxies and CDNs, and can be cached. It doesn't support generic server→client push, but it does support the streaming-data-from-server pattern, which is what generator actions need.

2. **Q: Should the handler return `AsyncGenerator<T>` or `AsyncIterable<T>`?**

   **A:** `AsyncGenerator<T>` — the natural fit for a generator function (`async function*`). `AsyncIterable<T>` is the consumed interface; the handler produces via generator.

3. **Q: How does the client consume streamed responses?**

   **A:** As a generator as well — the client-side action returns `AsyncGenerator<Chunk>`, consumed via `for await...of`. The client reads the chunked HTTP response, parses each chunk boundary (newline-delimited JSON), and yields each parsed chunk.

4. **Q: Should streaming be a new action type or an extension of `makeJayAction`?**

   **A:** New builder — `makeJayStream` (or `makeJayGeneratorAction`). Streaming has different semantics (generator vs promise, chunked vs single response) and keeping it separate makes the API clear.

5. **Q: How does this interact with the `.jay-action` metadata schema?**

   **A:** Same `.jay-action` file format, with a `streaming: true` field to indicate the action yields multiple chunks. The `outputSchema` describes the shape of each chunk (not the full response).

## Design

### Handler: `AsyncGenerator` return type

```typescript
export const discoverParams = makeJayStream('routes.discoverParams')
    .withServices(PRODUCTS_SERVICE)
    .withHandler(async function* (input, productsService) {
        let page = 1;
        while (true) {
            const products = await productsService.list({ page, pageSize: 100 });
            yield products.map(p => ({ slug: p.slug }));
            if (!products.hasMore) break;
            page++;
        }
    });
```

### Transport: Chunked HTTP (NDJSON)

Single HTTP request, single response. The response body is written incrementally using newline-delimited JSON (NDJSON). Each `yield` writes a JSON line. A final line signals completion.

- Works through proxies and CDNs
- Cacheable (standard HTTP)
- Simple to implement — just `res.write()` per chunk
- Client reads via `fetch` + `ReadableStream` + line splitting
- Line-break safe: `JSON.stringify` escapes newlines in string values as `\n`, so each chunk is guaranteed to be a single line. No extra encoding needed.

### Wire Format

```
{"chunk":[{"slug":"item-a"},{"slug":"item-b"}]}
{"chunk":[{"slug":"item-c"}]}
{"done":true}
```

Each line is a complete JSON object. The client reads line by line and yields parsed chunks.

### Client API

The client-side action returns `AsyncGenerator<Chunk>`:

```typescript
for await (const params of discoverParams({ route: '/products/[slug]' })) {
    console.log(params); // [{ slug: 'item-a' }, { slug: 'item-b' }]
}
```

Implementation: `fetch` the action endpoint, read the response body as a stream, split by newlines, parse each line, yield `chunk` values until `done`.

### Action Router Changes

The action router currently does:
```typescript
const result = await registry.execute(actionName, input);
res.status(200).json({ success: true, data: result.data });
```

For streaming actions:
```typescript
if (action.isStreaming) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const generator = registry.executeStream(actionName, input);
    for await (const chunk of generator) {
        res.write(JSON.stringify({ chunk }) + '\n');
    }
    res.write(JSON.stringify({ done: true }) + '\n');
    res.end();
}
```

### `.jay-action` Metadata

Add `streaming: true` to the action metadata:

```yaml
name: discoverParams
description: Discover all URL params for a route by querying the product catalog
streaming: true
inputSchema:
  route: string
outputSchema:
  - slug: string
```

### Action Types

| Builder | Handler return | Transport | Use case |
|---------|---------------|-----------|----------|
| `makeJayAction` | `Promise<T>` | POST → JSON | Mutations |
| `makeJayQuery` | `Promise<T>` | GET → JSON | Reads |
| `makeJayStream` | `AsyncIterable<T>` | POST → NDJSON | Streaming |

### Type Signature

Server and client share the same type — the handler's yield type becomes the client's iterable type:

```typescript
interface JayStreamAction<Input, Chunk> {
    (input: Input): AsyncIterable<Chunk>;
    readonly actionName: string;
    readonly method: 'POST';
    readonly _brand: 'JayStreamAction';
}

interface JayStreamActionDefinition<Input, Chunk, Services extends any[]> {
    actionName: string;
    method: 'POST';
    isStreaming: true;
    services: ServiceMarkers<Services>;
    handler: (input: Input, ...services: Services) => AsyncIterable<Chunk>;
}
```

## Implementation Plan

### Phase 1: `makeJayStream` builder

- New builder function returning `JayStreamAction<Input, Chunk>`
- Handler type: `(input: Input, ...services) => AsyncIterable<Chunk>`
- Action definition includes `isStreaming: true` flag
- Builder API mirrors `makeJayAction`: `.withServices()`, `.withHandler()`

### Phase 2: Server-side streaming

- Action registry: `executeStream(name, input)` returns `AsyncIterable`
- Action router: detect streaming actions (`isStreaming`), respond with NDJSON
- Each yielded chunk → `res.write(JSON.stringify({ chunk }) + '\n')`
- Generator completion → `res.write(JSON.stringify({ done: true }) + '\n')` + `res.end()`
- Error → `res.write(JSON.stringify({ error: message }) + '\n')` + `res.end()`

### Phase 3: Client-side consumption

- `JayStreamAction` callable returns `AsyncIterable<Chunk>`
- Client uses `fetch` with `ReadableStream` to consume NDJSON response
- Reads line by line, parses each JSON line, yields `chunk` values until `done`
- Supports `for await...of` and early termination (`break` closes the connection)

### Phase 4: Tests

- Unit test: `makeJayStream` builder creates correct definition with `isStreaming: true`
- Integration test: action router handles streaming action — yields multiple chunks, terminates with `done`
- Client test: `JayStreamAction` callable returns async iterable with correct chunks
- Error test: handler error mid-stream produces error line and terminates

## Trade-offs

- **Chunked HTTP over SSE/WebSocket**: simplest approach. Single request, single response, standard HTTP caching. No special protocols. Doesn't support server-initiated push, but generator actions don't need it — the client initiates and the server streams back.
- **NDJSON format**: each line is self-contained JSON. Easy to parse (split by newline, `JSON.parse` each line). Well-established pattern (used by Docker, npm, etc.).
- **New builder (`makeJayStream`)**: separate from `makeJayAction`/`makeJayQuery` to keep semantics clear. Generator handlers have different error handling, return types, and transport.
- **`AsyncGenerator` on both sides**: server handler is `async function*`, client receives `AsyncGenerator`. Symmetric, composable, supports `for await...of` and early termination (`break`).
- **`.jay-action` with `streaming: true`**: minimal schema extension. `outputSchema` describes the chunk shape. Agents can discover streaming actions and know what each chunk looks like.
