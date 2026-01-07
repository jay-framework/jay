# Transitive Plugin Dependency Resolution

## Background

Design Log #65 introduced `makeJayInit` for plugin initialization. The dev server discovers plugins by scanning the project's `package.json` dependencies and executes their init functions in dependency order.

Current discovery in `plugin-init-discovery.ts`:

```typescript
// Scans ONLY direct dependencies from project's package.json
const allDeps = {
  ...projectPackageJson.dependencies,
  ...projectPackageJson.devDependencies,
};
for (const depName of Object.keys(allDeps)) {
  // Try to find plugin.yaml...
}
```

## Problem

Two issues arise with transitive plugin dependencies:

### Issue 1: Client Import Resolution in Dev Mode

When `wix-stores` depends on `wix-server-client`:

**Source file (`wix-stores/lib/contexts/wix-stores-context.ts`):**

```typescript
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client';
```

**Built dist file (`wix-stores/dist/index.client.js`):**

```typescript
import { WIX_CLIENT_CONTEXT } from '@jay-framework/wix-server-client'; // ❌ Wrong - should be /client
```

The problem: Both in **production** (built dist files) and **dev mode**, the import resolves to the main entry (`index.js`) instead of the client entry (`index.client.js`). The Vite build's `external` configuration preserves the import as-is without transformation.

### Issue 2: Transitive Plugin Discovery

When a project only has `wix-stores` as a direct dependency:

```json
// Project package.json
{
  "dependencies": {
    "@jay-framework/wix-stores": "workspace:^"
    // wix-server-client is NOT listed (it's a transitive dep)
  }
}
```

The `discoverPluginsWithInit` function only scans **direct dependencies**, so:

- `wix-stores` is discovered ✅
- `wix-server-client` is NOT discovered ❌

Result: `wix-server-client`'s server init doesn't run → `WIX_CLIENT_SERVICE` is not registered → `wix-stores` init fails when calling `getService(WIX_CLIENT_SERVICE)`.

## Questions and Answers

**Q1: Should plugin dependencies be explicitly declared in plugin.yaml?**
A: No, use existing package.json dependencies. This is already available and avoids redundancy.

**Q2: How deep should transitive discovery go?**
A: Recursively discover all plugin dependencies until no new plugins are found. Plugins are identified by having a `plugin.yaml`.

**Q3: For Issue 1, where should the import transformation happen?**
A: In the Jay Stack compiler's Vite plugin, we should transform imports from plugin packages to use the `/client` subpath when in client context.

## Design

### Fix for Issue 2: Recursive Plugin Discovery

Modify `discoverPluginsWithInit` to recursively discover transitive plugin dependencies:

```typescript
export async function discoverPluginsWithInit(
  options: PluginInitDiscoveryOptions,
): Promise<PluginWithInit[]> {
  const plugins: PluginWithInit[] = [];
  const visitedPackages = new Set<string>();

  // Queue of package names to check
  const packagesToCheck: string[] = [];

  // 1. Seed with project's runtime dependencies (not devDependencies)
  const projectPackageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'),
  );
  packagesToCheck.push(...Object.keys(projectPackageJson.dependencies || {}));

  // 2. Process queue, discovering transitive plugin dependencies
  while (packagesToCheck.length > 0) {
    const depName = packagesToCheck.shift()!;
    if (visitedPackages.has(depName)) continue;
    visitedPackages.add(depName);

    // Check if this package is a Jay plugin
    const pluginInfo = await tryDiscoverPlugin(depName, projectRoot);
    if (!pluginInfo) continue;

    plugins.push(pluginInfo);

    // Add this plugin's dependencies to the queue
    packagesToCheck.push(...pluginInfo.dependencies);
  }

  return plugins;
}
```

### Fix for Issue 1: Client Import Transformation

Add a Vite plugin transformation that rewrites plugin package imports in client context.

**Important:** Use `transform` hook, not `resolveId`, because rollup's `external` option is evaluated before `resolveId` hooks. By transforming the source code, we change the import path before any resolution or external checking happens.

**In `jayStackCompiler` (via `plugin-client-import-resolver.ts`):**

```typescript
transform(code, id, options) {
    // Only transform in client context
    if (options?.ssr) return null;

    // Use regex to find and replace import declarations
    // Rewrite: import { X } from '@jay-framework/wix-server-client'
    // To:      import { X } from '@jay-framework/wix-server-client/client'

    const IMPORT_REGEX = /import\s+(.+?)\s+from\s+(['"])([^'"]+)\2/g;

    return code.replace(IMPORT_REGEX, (match, clause, quote, source) => {
        const packageName = extractPackageName(source);
        if (!isJayPluginWithClientExport(packageName)) return match;
        if (isSubpathImport(source, packageName)) return match;

        return `import ${clause} from ${quote}${packageName}/client${quote}`;
    });
}
```

## Implementation Plan

### Phase 1: Recursive Plugin Discovery (Issue 2)

1. Modify `discoverPluginsWithInit` in `plugin-init-discovery.ts`:

   - Add `visitedPackages: Set<string>` to avoid cycles
   - Add queue-based traversal of plugin dependencies
   - Test with wix-stores → wix-server-client dependency chain

2. Update tests to verify transitive discovery

### Phase 2: Client Import Transformation (Issue 1)

1. Add import transformation logic to the Jay Stack Vite plugin
2. Detect when code is being processed for client bundle
3. Transform imports from plugin packages to use `/client` subpath
4. Only apply when the package exports a `/client` subpath

## Trade-offs

| Approach                     | Pros                               | Cons                             |
| ---------------------------- | ---------------------------------- | -------------------------------- |
| Recursive discovery          | Simple, uses existing package.json | Could be slow with many packages |
| Explicit deps in plugin.yaml | Clear declaration                  | Redundant with package.json      |
| Import transformation        | Works transparently                | Additional compile step          |
| Vite aliases                 | Simple config                      | Must be set for each plugin      |

## Examples

### Before (Issue 2)

```
Project has: wix-stores
wix-stores depends on: wix-server-client

Discovered: [wix-stores]  ❌ Missing wix-server-client
```

### After

```
Project has: wix-stores
wix-stores depends on: wix-server-client

Discovered: [wix-server-client, wix-stores]  ✅ Both discovered
Init order: wix-server-client → wix-stores  ✅ Correct order
```

---

## Implementation Results

### Phase 1: Recursive Plugin Discovery

Modified `plugin-init-discovery.ts`:

- Added `visitedPackages: Set<string>` to track visited packages
- Changed NPM plugin scanning to use queue-based traversal
- For each discovered plugin, its dependencies are added to the queue
- Transitive plugin dependencies are now discovered automatically

Key changes:

```typescript
// Queue-based traversal for transitive dependencies
const packagesToCheck = [...initialDeps];

while (packagesToCheck.length > 0) {
  const depName = packagesToCheck.shift()!;
  if (visitedPackages.has(depName)) continue;
  visitedPackages.add(depName);

  // ... discover plugin ...

  // Add this plugin's dependencies to the queue
  for (const transitiveDep of dependencies) {
    if (!visitedPackages.has(transitiveDep)) {
      packagesToCheck.push(transitiveDep);
    }
  }
}
```

### Phase 2: Client Import Transformation

Created new file `plugin-client-import-resolver.ts`:

- `createPluginClientImportResolver()` Vite plugin
- Uses `transform` hook (not `resolveId`) to rewrite import declarations
- The `transform` approach ensures rewrites happen BEFORE rollup's `external` option is evaluated
- In client builds (options.ssr = false), rewrites main entry imports to /client
- Detects Jay plugins by checking for plugin.yaml
- Verifies /client export exists before rewriting
- Caches plugin detection results for performance
- Handles both `import ... from` and `export ... from` declarations

Added to `jayStackCompiler()` in `index.ts`:

```typescript
// Plugin client import resolver - rewrites plugin package imports to /client
plugins.push(createPluginClientImportResolver({ verbose: shouldTrackImports }));
```

Note: Using `transform` instead of `resolveId` is critical because rollup's `external` configuration is evaluated before `resolveId` hooks can intercept the import. By transforming the source code, we change the import path before any resolution happens.

### Phase 3: Client Init Filtering for Transitive Dependencies

The dev server filters which plugin inits to include in each page's client script based on `usedPackages`. However, this only included directly-used packages, not their transitive plugin dependencies.

Fixed in `dev-server/lib/dev-server.ts`:

- Added `filterPluginsForPage()` function
- Expands `usedPackages` to include transitive plugin dependencies
- Uses the plugin's `dependencies` array to find plugin-to-plugin dependencies

```typescript
function filterPluginsForPage(
  allPluginClientInits: PluginClientInitInfo[],
  allPluginsWithInit: PluginWithInit[],
  usedPackages: Set<string>,
): PluginClientInitInfo[] {
  // Expand usedPackages to include transitive plugin dependencies
  const expandedPackages = new Set<string>(usedPackages);
  const toProcess = [...usedPackages];

  while (toProcess.length > 0) {
    const packageName = toProcess.pop()!;
    const plugin = pluginsByPackage.get(packageName);
    if (!plugin) continue;

    for (const dep of plugin.dependencies) {
      if (pluginsByPackage.has(dep) && !expandedPackages.has(dep)) {
        expandedPackages.add(dep);
        toProcess.push(dep);
      }
    }
  }
  // ...filter using expandedPackages
}
```

### Files Changed

1. `stack-server-runtime/lib/plugin-init-discovery.ts`

   - Added transitive dependency discovery

2. `compiler-jay-stack/lib/plugin-client-import-resolver.ts` (new)

   - Vite plugin for client import resolution
   - Extracted `PluginDetector` interface for testability

3. `compiler-jay-stack/lib/index.ts`

   - Added import and usage of plugin client import resolver
   - Exported new utilities

4. `dev-server/lib/dev-server.ts`
   - Added `filterPluginsForPage()` to include transitive plugin dependencies in client init
