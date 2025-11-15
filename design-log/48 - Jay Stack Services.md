# Jay Stack Services

## The Problem

Jay Stack pages need access to server-side singletons like database connections, API clients, configuration services, and other infrastructure services. Currently, the `serverContexts` array in the jay-stack-builder is used to pass dependencies to page rendering functions (`loadParams`, `slowlyRender`, `fastRender`), but:

1. The naming is confusing - "context" implies hierarchical parent-child relationships (like client contexts), but server dependencies are actually global singletons
2. There's no clear pattern for initializing and providing these services
3. The dev-server has no mechanism to load service definitions on startup or reload them during development

## The Solution: Services Pattern

We introduce a **Services** pattern for server-side dependency injection, distinct from the hierarchical client-side **Context** pattern.

### Key Differences from Client Contexts

| Aspect    | Client Contexts                   | Server Services              |
| --------- | --------------------------------- | ---------------------------- |
| Scope     | Hierarchical (parent→child)       | Flat (global singletons)     |
| Lifecycle | Component tree lifetime           | Application/request lifetime |
| Updates   | Reactive (can trigger re-renders) | Static per request           |
| Runtime   | Browser                           | Server (Node.js)             |

### Naming Convention

We propose renaming to clarify intent:

**Current naming:**

- `serverContexts` - confusing, implies hierarchy
- `clientContexts` - redundant "client" prefix

**Proposed naming:**

- `services` (or `serverServices` if clarity needed) - server-side singletons
- `contexts` - client-side hierarchical contexts

Alternative considered: `serverDependencies`, but "services" is more idiomatic.

## Implementation

### 1. Service Marker Pattern

Similar to client `ContextMarker<T>`, we create a `ServiceMarker<T>` in the stack-server-runtime package:

```typescript
// In @jay-framework/stack-server-runtime

export interface ServiceMarker<ServiceType> {}

export function createJayService<ServiceType = unknown>(name?: string): ServiceMarker<ServiceType> {
  return Symbol(name);
}
```

**Benefits:**

- Optional `name` parameter for better error messages
- Symbol description helps identify which service is missing
- Type-safe marker carries type information

Key differences from `ContextMarker`:

- No hierarchical lookup needed (flat structure)
- Services are registered globally, not in a stack
- Services are initialized once at startup

### 2. Service Registry & Lifecycle Hooks

The stack-server-runtime provides a global service registry and lifecycle management:

```typescript
// Service registry
const serviceRegistry = new Map<symbol, any>();

export function registerService<ServiceType>(
  marker: ServiceMarker<ServiceType>,
  service: ServiceType,
): void {
  serviceRegistry.set(marker as symbol, service);
}

export function getService<ServiceType>(marker: ServiceMarker<ServiceType>): ServiceType {
  const service = serviceRegistry.get(marker as symbol);
  if (service === undefined) {
    const symbolKey = marker as symbol;
    const serviceName = symbolKey.description || 'Unknown service';
    throw new Error(
      `Service '${serviceName}' not found. Did you register it in jay.init.ts?\n` +
        `Make sure to call: registerService(${serviceName.toUpperCase()}_SERVICE, ...)`,
    );
  }
  return service;
}

export function clearServiceRegistry(): void {
  serviceRegistry.clear();
}

// Lifecycle hooks
type InitCallback = () => void | Promise<void>;
type ShutdownCallback = () => void | Promise<void>;

const initCallbacks: InitCallback[] = [];
const shutdownCallbacks: ShutdownCallback[] = [];

export function onInit(callback: InitCallback): void {
  initCallbacks.push(callback);
}

export function onShutdown(callback: ShutdownCallback): void {
  shutdownCallbacks.push(callback);
}

// Internal APIs for dev-server to call
export async function runInitCallbacks(): Promise<void> {
  for (const callback of initCallbacks) {
    await callback();
  }
}

export async function runShutdownCallbacks(): Promise<void> {
  // Run in reverse order (LIFO - last registered, first shut down)
  for (let i = shutdownCallbacks.length - 1; i >= 0; i--) {
    await shutdownCallbacks[i]();
  }
}

export function clearLifecycleCallbacks(): void {
  initCallbacks.length = 0;
  shutdownCallbacks.length = 0;
}
```

### 3. Init File Pattern - Lifecycle Hooks

Projects can create a `jay.init.ts` (or `jay.init.js`) file at the project root that registers lifecycle hooks.

The API uses a **hook-based pattern** where you call `onInit()` and `onShutdown()` at the top level:

```typescript
// jay.init.ts

import {
  onInit,
  onShutdown,
  registerService,
  getService,
} from '@jay-framework/stack-server-runtime';
import { DATABASE_SERVICE, INVENTORY_SERVICE } from './services';

onInit(async () => {
  console.log('Initializing services...');

  const db = await connectToDatabase(process.env.DATABASE_URL);
  registerService(DATABASE_SERVICE, db);

  const inventory = new InventoryService(db);
  registerService(INVENTORY_SERVICE, inventory);

  console.log('Services initialized successfully');
});

onShutdown(async () => {
  console.log('Shutting down services...');

  // Retrieve services for cleanup
  const inventory = getService(INVENTORY_SERVICE);
  const db = getService(DATABASE_SERVICE);

  // Clean up in reverse order of initialization
  inventory?.dispose();
  await db?.close();

  console.log('Services shut down successfully');
});
```

**Benefits of hook pattern:**

- **Declarative** - Clear intent, reads top-to-bottom
- **Simple** - No exports needed, just call the hooks
- **No module state** - Use `getService()` to retrieve services instead of file-level variables
- **Flexible** - Both hooks are optional (omit `onShutdown` if no cleanup needed)
- **Familiar** - Follows modern JavaScript patterns (similar to React hooks, Vitest setup files)
- **Composable** - Can call hooks multiple times, they'll run in order

**How it works:**

1. The dev-server imports `jay.init.ts`
2. The module executes at import time
3. Calling `onInit()` registers the callback
4. Calling `onShutdown()` registers the cleanup callback
5. Dev-server invokes registered callbacks at appropriate times

The dev-server package will:

1. Look for `jay.init.ts` on startup
2. Import the file (triggers hook registration)
3. Execute all registered `onInit` callbacks
4. On shutdown/reload, execute all registered `onShutdown` callbacks

### 4. Builder API Update

Update `jay-stack-builder.ts` to rename `serverContexts` → `services`:

```typescript
// Before
withServerContext<NewServerContexts extends Array<any>>(
    ...contextMarkers: ContextMarkers<NewServerContexts>
)

// After
withServices<NewServices extends Array<any>>(
    ...serviceMarkers: ServiceMarkers<NewServices>
)
```

And rename `clientContexts` → `contexts`:

```typescript
// Before
withClientContext<NewClientContexts extends Array<any>>(
    ...contextMarkers: ContextMarkers<NewClientContexts>
)

// After
withContexts<NewContexts extends Array<any>>(
    ...contextMarkers: ContextMarkers<NewContexts>
)
```

### 5. Complete Usage Example

```typescript
// services/database.service.ts
import { createJayService } from '@jay-framework/stack-server-runtime';
import { Pool } from 'pg';

export interface DatabaseService {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  close(): Promise<void>;
}

export const DATABASE_SERVICE = createJayService<DatabaseService>('DatabaseService');

export function createDatabaseService(connectionString: string): DatabaseService {
  const pool = new Pool({ connectionString });

  return {
    async query<T>(sql: string, params?: any[]): Promise<T[]> {
      const result = await pool.query(sql, params);
      return result.rows;
    },
    async close() {
      await pool.end();
    },
  };
}

// services/inventory.service.ts
import { createJayService } from '@jay-framework/stack-server-runtime';
import type { DatabaseService } from './database.service';

export interface InventoryService {
  getStock(productId: string): Promise<number>;
  dispose(): void;
}

export const INVENTORY_SERVICE = createJayService<InventoryService>('InventoryService');

export function createInventoryService(db: DatabaseService): InventoryService {
  return {
    async getStock(productId: string) {
      const [result] = await db.query<{ stock: number }>(
        'SELECT stock FROM inventory WHERE product_id = $1',
        [productId],
      );
      return result?.stock ?? 0;
    },
    dispose() {
      // Clean up any resources if needed
    },
  };
}

// jay.init.ts (project root)
import {
  onInit,
  onShutdown,
  registerService,
  getService,
} from '@jay-framework/stack-server-runtime';
import { DATABASE_SERVICE, createDatabaseService } from './services/database.service';
import { INVENTORY_SERVICE, createInventoryService } from './services/inventory.service';

onInit(async () => {
  console.log('Initializing services...');

  const db = createDatabaseService(process.env.DATABASE_URL!);
  registerService(DATABASE_SERVICE, db);

  const inventory = createInventoryService(db);
  registerService(INVENTORY_SERVICE, inventory);

  console.log('Services initialized successfully');
});

onShutdown(async () => {
  console.log('Shutting down services...');

  // Retrieve services for cleanup (in reverse order)
  const inventory = getService(INVENTORY_SERVICE);
  const db = getService(DATABASE_SERVICE);

  // Clean up
  inventory?.dispose();
  await db?.close();

  console.log('Services shut down successfully');
});

// pages/product/page.ts
import { DATABASE_SERVICE, INVENTORY_SERVICE } from '../../services';

export const ProductPage = makeJayStackComponent<typeof render>()
  .withProps<{ productId: string }>()
  .withServices(DATABASE_SERVICE, INVENTORY_SERVICE)
  .withSlowlyRender(async (props, db, inventory) => {
    const [product] = await db.query('SELECT * FROM products WHERE id = $1', [props.productId]);
    const stock = await inventory.getStock(props.productId);

    return partialRender({ productName: product.name, inStock: stock > 0 }, { stock });
  })
  .withInteractive(ProductPageComponent);
```

## Dev-Server Integration

The dev-server package (`packages/jay-stack/dev-server`) manages the full service lifecycle:

### Startup Flow

1. **Find init file** - Look for `jay.init.ts` (or `.js`) in project root
2. **Import module** - Import the file (this registers hooks via `onInit`/`onShutdown` calls)
3. **Run init callbacks** - Execute all registered `onInit` callbacks in order
4. **Ready state** - Server is ready to handle requests

### Hot Reload Flow (Development Mode)

When `jay.init.ts` or any service file changes:

1. **Detect change** - File watcher triggers on save
2. **Graceful shutdown** - Call `shutdown()` if exported
   - Wait up to 5 seconds for graceful shutdown
   - Force kill remaining connections if timeout exceeded
3. **Clear registry** - Clear the service registry
4. **Clear module cache** - Delete module from Node.js require cache
5. **Reload module** - Re-import the updated init file
6. **Re-initialize** - Call `initialize()` again
7. **Notify clients** - Trigger browser refresh via WebSocket

```typescript
// Pseudo-code for hot reload in dev-server
import {
  runShutdownCallbacks,
  clearLifecycleCallbacks,
  clearServiceRegistry,
  runInitCallbacks,
} from '@jay-framework/stack-server-runtime';

async function reloadServices() {
  // Step 1: Shutdown existing services
  try {
    await Promise.race([runShutdownCallbacks(), timeout(5000)]);
  } catch (error) {
    console.warn('Service shutdown timed out or failed:', error);
  }

  // Step 2: Clear all caches
  clearLifecycleCallbacks(); // Clear registered hooks
  clearServiceRegistry(); // Clear registered services
  delete require.cache[require.resolve('./jay.init.ts')];

  // Step 3: Reload and initialize
  await import('./jay.init.ts'); // Re-registers hooks
  await runInitCallbacks(); // Execute new init hooks

  // Step 4: Notify connected clients
  broadcastReload();
}
```

### Production Flow

In production (no hot reload):

1. **Startup** - Initialize services once
2. **Serve** - Handle requests
3. **Shutdown** - On SIGTERM/SIGINT, call `shutdown()` before exiting

```typescript
// Graceful shutdown in production
import { runShutdownCallbacks } from '@jay-framework/stack-server-runtime';

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await runShutdownCallbacks();
  process.exit(0);
});
```

## Benefits

1. **Clear naming** - "services" clearly indicates server singletons, "contexts" for client hierarchy
2. **Type safety** - ServiceMarker provides compile-time type checking
3. **Proper lifecycle** - Initialize and shutdown hooks ensure clean resource management
4. **Hot reload** - Services can be gracefully shut down and reloaded during development
5. **Testability** - Services can be mocked by registering test implementations
6. **Separation of concerns** - Infrastructure setup separate from page logic
7. **Graceful shutdown** - Production servers can clean up resources properly on termination

## Migration Path

This is a breaking change but straightforward to migrate:

1. Rename `withServerContext` → `withServices`
2. Rename `withClientContext` → `withContexts`
3. Create `jay.init.ts` using `onInit()` and `onShutdown()` hooks
4. Update imports from `createJayContext` → `createJayService` for server dependencies

**Example migration:**

Before:

```typescript
// Old pattern - no lifecycle management
import { DATABASE } from './database';
// Global initialization happens at module load
```

After:

```typescript
// New pattern - explicit lifecycle
import {
  onInit,
  onShutdown,
  registerService,
  getService,
} from '@jay-framework/stack-server-runtime';
import { DATABASE_SERVICE, createDatabase } from './database';

onInit(async () => {
  const db = await createDatabase();
  registerService(DATABASE_SERVICE, db);
});

onShutdown(async () => {
  const db = getService(DATABASE_SERVICE);
  await db?.close();
});
```

## API Design Considerations

### Why Hook-Based Pattern?

We chose `onInit(callback)` and `onShutdown(callback)` over export-based patterns:

**Advantages:**

- **Declarative** - Clear intent without ceremony
- **No exports needed** - Just call functions at top level
- **Composable** - Can split initialization across multiple calls/files
- **Familiar pattern** - Similar to Vitest's `beforeAll`/`afterAll`, React hooks
- **Order control** - Callbacks run in registration order; shutdown runs in reverse

**Example of composability:**

```typescript
// jay.init.ts
import './services/database.init'; // Registers its own hooks
import './services/cache.init'; // Registers its own hooks
import './services/queue.init'; // Registers its own hooks

// Each service file can manage its own lifecycle
```

```typescript
// services/database.init.ts
import {
  onInit,
  onShutdown,
  registerService,
  getService,
} from '@jay-framework/stack-server-runtime';
import { DATABASE_SERVICE, createDatabaseService } from './database.service';

onInit(async () => {
  const db = await createDatabaseService(process.env.DATABASE_URL);
  registerService(DATABASE_SERVICE, db);
});

onShutdown(async () => {
  const db = getService(DATABASE_SERVICE);
  await db?.close();
});
```

**Alternative naming considered:**

- `setupInit()` / `setupShutdown()` - Too verbose
- `useInit()` / `useShutdown()` - "use" implies return value (React convention)
- `init()` / `shutdown()` - Shorter, but less clear these are hooks
- `onInit()` / `onShutdown()` - **Selected** - Clear event handler pattern

### Service Registry Design

The registry is intentionally simple - a Map keyed by symbols:

**Why not a DI container?**

- Keeps it simple - no complex resolution algorithms
- Explicit dependencies - services are passed directly to render functions
- Type-safe - TypeScript validates service types at compile time
- No magic - developers see exactly what's injected

**Why symbols as keys?**

- Type safety - `ServiceMarker<T>` carries type information
- No string collisions - symbols are guaranteed unique
- Same pattern as client contexts - consistent API

## Future Enhancements

1. **Lifecycle hooks** - Additional hooks like `beforeReload`, `afterReload`, `healthCheck`
2. **Scoped services** - Services could have request scope (new instance per request)
3. **Service dependencies** - Services could declare dependencies on other services
4. **Lazy initialization** - Services could be initialized on first use
5. **Service composition** - Higher-order services that wrap other services
6. **Metrics and monitoring** - Built-in observability for service health and performance
