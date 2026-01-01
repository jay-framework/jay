# Client Context Initialization and Plugin Init Files

## Background

Jay Stack has a server-side initialization pattern via `jay.init.ts`:
- Uses `onInit()` / `onShutdown()` hooks to register services
- Services are global singletons available during server rendering
- Dev-server loads and executes `jay.init.ts` on startup

Currently, client-side contexts are:
- Created inside component constructors via `provideReactiveContext()`
- Cannot receive data from the server (like access tokens)
- Must be initialized inline, no centralized initialization

Plugins can declare:
- `actions` - server-side actions auto-registered
- `contracts` - component contracts for pages
- No client or server init files

## Problem

1. **No client context initialization pattern** - Unlike server services, there's no `jay.client-init.ts` equivalent for initializing client-side contexts before components render.

2. **No server-to-client data passing** - For auth tokens, user info, config, etc., there's no standard pattern to pass server-computed data to client contexts.

3. **No plugin init files** - Plugins cannot define their own initialization logic that runs automatically when the plugin is used.

## Questions and Answers

### Q1: What data needs to flow from server to client for context initialization?
**Answer:** Static/slowly-changing application configuration:
- Configuration values (e.g., items per page in product search)
- OAuth client IDs
- Feature flags
- A/B test information

**Key constraints:**
- Data is set at build/application initialization time (slowly changing)
- Data does NOT change during the lifecycle of a client page
- NOT per-request or per-page dynamic data

### Q2: Should client init run before or after component tree creation?
**Answer:** Before - contexts must be available when components construct.

### Q3: How do plugins declare init dependencies on other plugins?
**Answer:** Use `package.json` dependencies. The framework reads dependency graph from package.json to determine init order.

### Q4: Should there be separate init files for server and client in plugins, or one file with both?
**Answer:** Separate files - different concerns with different dependencies (server code should never reach client bundle).

### Q5: What's the lifecycle of client contexts - per page load or per SPA navigation?
**Answer:** Per page for now. Future SPA support may change this.

## Design

### 1. Client Initialization File: `jay.client-init.ts`

Similar to `jay.init.ts` for server, projects can create a `jay.client-init.ts` file:

```typescript
// src/jay.client-init.ts
import { onClientInit, registerGlobalContext } from '@jay-framework/stack-client-runtime';
import { APP_CONFIG_CONTEXT } from './contexts/app-config';
import { THEME_CONTEXT, createThemeContext } from './contexts/theme';

// Called with static config data from server
onClientInit((serverData) => {
  // Register app-wide contexts using server config
  registerGlobalContext(APP_CONFIG_CONTEXT, {
    itemsPerPage: serverData.itemsPerPage,
    features: serverData.featureFlags,
  });
  registerGlobalContext(THEME_CONTEXT, createThemeContext(serverData.defaultTheme));
});
```

### 2. Server-to-Client Data via `setClientInitData`

The server provides static application-level data for client initialization. This data is:
- Set once at application startup (not per-request)
- Slowly changing (configuration, feature flags)
- Serializable to JSON

```typescript
// src/jay.init.ts
import { onInit, setClientInitData } from '@jay-framework/stack-server-runtime';

onInit(async () => {
  // Set static client init data (not per-request)
  setClientInitData({
    oauthClientId: process.env.OAUTH_CLIENT_ID,
    itemsPerPage: 20,
    featureFlags: await loadFeatureFlags(),
    abTestVariants: await loadABTestConfig(),
  });
});
```

The data is serialized once and embedded in all page HTML, then passed to `onClientInit` callbacks.

### 3. Client Context Registry

The Jay runtime library already has a context registry infrastructure. We extend it to support pre-registered contexts that are available before component tree construction:

```typescript
// In @jay-framework/runtime (existing infrastructure)
// We add functions to register contexts at the app level

export function registerGlobalContext<T>(
  marker: ContextMarker<T>,
  context: T
): void {
  // Registers context in existing runtime infrastructure
  // Available to all components via useContext(marker)
}
```

Components continue to use the standard `useContext` API - registered global contexts are found automatically.

### 4. Plugin Init Files

Plugins can define initialization files in `plugin.yaml`:

```yaml
# plugin.yaml
name: wix-stores
version: 1.0.0

# Existing
actions:
  - addToCart
  - getProduct

# New: Init files (optional)
init:
  server: ./init/server-init.ts
  client: ./init/client-init.ts
```

**Dependency ordering:** Uses `package.json` dependencies. If `wix-stores` depends on `wix-auth` in package.json, then `wix-auth`'s init runs before `wix-stores`'s init.

Plugin init files use the same hooks as project init:

```typescript
// wix-stores/init/server-init.ts
import { onInit, getService, setClientInitData } from '@jay-framework/stack-server-runtime';
import { AUTH_SERVICE } from '@wix/auth';
import { STORES_SERVICE, createStoresService } from '../services/stores';

onInit(async () => {
  const auth = getService(AUTH_SERVICE);  // Available because wix-auth init ran first
  const stores = await createStoresService(auth);
  registerService(STORES_SERVICE, stores);
  
  // Plugins can contribute to client init data
  setClientInitData({
    storesConfig: stores.getClientConfig(),
  });
});
```

```typescript
// wix-stores/init/client-init.ts
import { onClientInit, registerGlobalContext } from '@jay-framework/stack-client-runtime';
import { STORES_CONTEXT, createStoresContext } from './stores-context';

onClientInit((serverData) => {
  registerGlobalContext(STORES_CONTEXT, createStoresContext(serverData.storesConfig));
});
```

### 5. Initialization Order

**Key principle:** Plugins initialize first, project last. This allows the project to extend, override, or depend on plugin-provided services and contexts.

1. **Server startup:**
   - Discover plugins with init files from `plugin.yaml`
   - Topologically sort plugins by `package.json` dependencies
   - Load and run plugin server init files (in dependency order)
   - Load and run project `jay.init.ts` (last)
   - Collect all `setClientInitData` contributions into merged object

2. **Page render (server):**
   - Embed merged client init data in page HTML (static, same for all pages)

3. **Client page load:**
   - Parse embedded client init data
   - Load plugin client init files (in dependency order)
   - Load project `jay.client-init.ts` (last)
   - Run `onClientInit` callbacks with merged server data
   - Mount component tree (all contexts now available)

### 6. Generated Client Script Updates

The `generateClientScript` function adds client init imports and execution:

```html
<script type="module">
  import { runClientInit } from "@jay-framework/stack-client-runtime";
  
  // Plugin client init imports (in dependency order)
  import "@wix/auth/init/client";
  import "@wix/stores/init/client";
  
  // Project client init (last)
  import "./jay.client-init";
  
  // Server-generated init data (static, set at server startup)
  const clientInitData = {"itemsPerPage":20,"enableNewCheckout":true};
  
  // Run all registered onClientInit callbacks
  await runClientInit(clientInitData);
  
  // Then mount component tree (existing code)
  import { makeCompositeJayComponent } from "@jay-framework/stack-client-runtime";
  // ... component mounting ...
</script>
```

## Implementation Plan

### Phase 1: Server-Side Client Data API
1. Add `setClientInitData(data)` to `stack-server-runtime`
2. Store merged client init data in ServiceLifecycleManager
3. Update page rendering to embed client init data in HTML

### Phase 2: Client Init File Support
1. Add `onClientInit(callback)` and `runClientInit(data)` to `stack-client-runtime`
2. Add `registerGlobalContext(marker, context)` to runtime (extends existing context infra)
3. Update `generateClientScript` to find and import `jay.client-init.ts`
4. Run client init before component mounting

### Phase 3: Plugin Init Files
1. Extend `PluginManifest` interface with `init?: { server?: string; client?: string }`
2. Update `ServiceLifecycleManager` to:
   - Discover plugins with init files
   - Read package.json dependencies for ordering
   - Topologically sort and load plugin server init files
3. Update `generateClientScript` to:
   - Include plugin client init imports (in dependency order)
   - Import project client init last
4. Test with multi-plugin dependency chains

## Examples

### Example 1: Feature Flags and Config

```typescript
// src/contexts/app-config.ts
import { createJayContext } from '@jay-framework/runtime';

export interface AppConfig {
  itemsPerPage: number;
  enableNewCheckout: boolean;
  abTestVariant: 'control' | 'variant-a' | 'variant-b';
}

export const APP_CONFIG_CONTEXT = createJayContext<AppConfig>();
```

```typescript
// src/jay.init.ts
import { onInit, setClientInitData } from '@jay-framework/stack-server-runtime';

onInit(async () => {
  const featureFlags = await loadFeatureFlags();
  
  setClientInitData({
    itemsPerPage: 20,
    enableNewCheckout: featureFlags.newCheckout,
    abTestVariant: await getABTestVariant('checkout-flow'),
  });
});
```

```typescript
// src/jay.client-init.ts
import { onClientInit, registerGlobalContext } from '@jay-framework/stack-client-runtime';
import { APP_CONFIG_CONTEXT, AppConfig } from './contexts/app-config';

onClientInit((data: AppConfig) => {
  registerGlobalContext(APP_CONFIG_CONTEXT, data);
});
```

```typescript
// src/pages/products.ts - Component using the config
import { APP_CONFIG_CONTEXT, AppConfig } from '../contexts/app-config';

function ProductListComponent(props, refs, config: AppConfig) {
  // config.itemsPerPage, config.enableNewCheckout available
  const pageSize = config.itemsPerPage;
  // ...
}

export const ProductList = makeJayComponent(render, ProductListComponent, APP_CONFIG_CONTEXT);
```

### Example 2: Plugin with Init Files

```yaml
# packages/wix-stores/plugin.yaml
name: wix-stores
version: 1.0.0
module: dist/index.js

contracts:
  - name: product-page
    contract: product-page.jay-contract
    component: productPage

actions:
  - addToCart
  - getProduct

init:
  server: dist/init/server.js
  client: dist/init/client.js
```

```json
// packages/wix-stores/package.json (dependencies determine init order)
{
  "name": "@wix/stores",
  "dependencies": {
    "@wix/auth": "^1.0.0"
  }
}
```

```typescript
// packages/wix-stores/src/init/server.ts
import { onInit, registerService, setClientInitData } from '@jay-framework/stack-server-runtime';
import { STORES_SERVICE, createStoresService } from '../services/stores';

onInit(async () => {
  const storesService = await createStoresService();
  registerService(STORES_SERVICE, storesService);
  
  // Contribute to client init data (merged with other plugins)
  setClientInitData({
    storesApiEndpoint: process.env.STORES_API_URL,
    defaultCurrency: 'USD',
  });
});
```

## Trade-offs

### Centralized vs Component-Inline Context Initialization

**Centralized (`jay.client-init.ts`):**
- ✅ Single place for app-wide context initialization
- ✅ Can receive server configuration data
- ✅ Clear initialization order (plugins → project)
- ❌ Another file to manage

**Component-Inline (`provideReactiveContext`):**
- ✅ Context defined close to where it's used
- ✅ Good for component-subtree-scoped contexts
- ❌ Cannot receive server data
- ❌ Initialization order depends on component tree

**Decision:** Support both. Centralized for app-wide contexts needing server data, inline for component-local contexts.

### Plugin Init: Single File vs Separate Files

**Separate files (chosen):**
- ✅ Clean separation for bundling
- ✅ Server file never sent to client
- ✅ Different dependencies per environment
- ❌ Two files instead of one

### Static vs Dynamic Client Init Data

**Static (chosen):**
- ✅ Set once at server startup
- ✅ Same for all pages/requests
- ✅ Cacheable
- ❌ Cannot vary per request/user

**Dynamic (rejected for now):**
- ✅ Could vary per user/request
- ❌ Adds complexity
- ❌ Blurs line with page props

**Decision:** Static data only. Per-request data should flow through page props and component rendering, not init.

### Dependency Order: Explicit vs package.json

**Using package.json (chosen):**
- ✅ Already maintained for npm
- ✅ Single source of truth
- ✅ Familiar to developers
- ❌ Less explicit in plugin.yaml

### Init Order: Plugins First vs Project First

**Plugins first, project last (chosen):**
- ✅ Project can depend on plugin services/contexts
- ✅ Project can override plugin defaults
- ✅ Mirrors typical extension patterns

