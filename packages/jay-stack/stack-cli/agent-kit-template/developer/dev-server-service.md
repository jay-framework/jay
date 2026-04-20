# Dev Server Service API

The dev server exposes a `DevServerService` for design board applications, CLI tools, and plugins. It provides route listing, param discovery, and freeze management.

## Service Marker

Registered as `DEV_SERVER_SERVICE` — injectable in actions and components:

```typescript
import { DEV_SERVER_SERVICE } from '@jay-framework/dev-server';

export const listAllRoutes = makeJayAction('admin.listRoutes')
  .withServices(DEV_SERVER_SERVICE)
  .withHandler(async (_input, devServer) => {
    return devServer.listRoutes();
  });
```

## Direct Access

Also returned from `mkDevServer()` for CLI usage:

```typescript
const { service } = await mkDevServer(options);
```

## Routes

### listRoutes()

Returns all page routes in the project:

```typescript
const routes = service.listRoutes();
// [{ path: '/products/kitan/[[category]]', jayHtmlPath: '...', compPath: '...' }]
```

### loadRouteParams(route, onBatch)

Async generator that yields param batches from the route's `loadParams`:

```typescript
for await (const batch of service.loadRouteParams('/products/kitan/[[category]]')) {
  console.log(batch); // [{ category: 'shirts' }, { category: 'pants' }]
}
```

Returns empty if the route has no `page.ts` or no `loadParams`. Throws if the route doesn't exist.

## Freeze Management

### FreezeStore

Accessible via `service.freezeStore`:

```typescript
const store = service.freezeStore;

// Save a ViewState snapshot
const entry = await store.save('/products/kitan', viewState);

// List freezes for a route
const freezes = await store.list('/products/kitan');

// Get a specific freeze
const freeze = await store.get('abc123');

// Rename
await store.rename('abc123', 'in-stock state');

// Delete
await store.delete('abc123');
```

## Editor Protocol

These APIs are also exposed via the editor protocol (Socket.IO) for design board applications:

| Protocol Message  | Service Method                            |
| ----------------- | ----------------------------------------- |
| `listRoutes`      | `service.listRoutes()`                    |
| `listFreezes`     | `service.freezeStore.list(route)`         |
| `renameFreeze`    | `service.freezeStore.rename(id, name)`    |
| `deleteFreeze`    | `service.freezeStore.delete(id)`          |
| `loadRouteParams` | `service.loadRouteParams(route, onBatch)` |

### Streaming Events

`loadRouteParams` streams batches via `routeParamsBatch` socket events:

```typescript
// Client sends: { type: 'loadRouteParams', route: '/products/[slug]' }
// Server responds: { type: 'loadRouteParams', success: true }
// Server emits:   { type: 'routeParamsBatch', route: '...', params: [...], hasMore: true }
// Server emits:   { type: 'routeParamsBatch', route: '...', params: [...], hasMore: true }
// Server emits:   { type: 'routeParamsBatch', route: '...', params: [], hasMore: false }
```

### Freeze Changed Event

The `freezeChanged` socket event is emitted when jay-html or CSS files change. Design board applications should listen for this to refresh their frozen views:

```typescript
socket.on('freezeChanged', () => {
  // Re-fetch frozen page fragments
});
```

## Iframe / Embed Mode

When a page is loaded inside an iframe with `?_jay_embed=true` (e.g., by the AIditor), the freeze shortcut (Alt+S) posts a message to the parent frame instead of opening a new tab:

```typescript
// Message posted to parent window
{ type: 'jay:freeze', id: string, route: string }
```

The parent application receives the message and constructs the frozen page URL:

```
route + '?_jay_freeze=' + id                        // full page
route + '?_jay_freeze=' + id + '&format=fragment'   // shadow DOM fragment
```
