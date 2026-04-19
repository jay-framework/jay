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

Runs the `loadParams` generator for a route and streams param batches:

```typescript
await service.loadRouteParams('/products/kitan/[[category]]', (batch) => {
  console.log(batch.params); // [{ category: 'shirts' }, { category: 'pants' }]
  console.log(batch.hasMore); // true while generator has more, false on last batch
});
```

Returns `{ success, error? }`. Fails if the route doesn't exist or has no `loadParams`.

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
