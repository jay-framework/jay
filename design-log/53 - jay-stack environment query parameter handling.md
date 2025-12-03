# Design Log #53: Jay Stack Environment Query Parameter Handling

## Problem Statement

The `@jay-framework/compiler-jay-stack` plugin adds `?jay-client` and `?jay-server` query parameters to local imports to propagate the transformation environment through the import chain. However, this breaks the `jay-plugin` (jay:runtime) because:

1. **Contract file detection fails**: Files like `mood-tracker.jay-contract?jay-client` are not recognized as contract files because `hasExtension(source, JAY_CONTRACT_EXTENSION)` looks for `.jay-contract` at the end.

2. **Jay-html file detection fails**: Same issue with `.jay-html` files.

3. **Potential collision with sandbox parameters**: The `jay-plugin` already uses similar query parameters (`?jay-main-sandbox`, `?jay-worker-trusted`, `?jay-worker-sandbox`) for security transformations. These could collide or interfere with the new `?jay-client`/`?jay-server` parameters.

### Example of the Problem

```typescript
// In mood-tracker-plugin/lib/index.ts
import { MoodTrackerContract } from './mood-tracker.jay-contract';

// After jay-stack-compiler transformation:
import { MoodTrackerContract } from './mood-tracker.jay-contract?jay-client';

// jay-plugin sees: 'mood-tracker.jay-contract?jay-client'
// jay-plugin checks: hasExtension(source, '.jay-contract') → FALSE ❌
// Contract file is NOT processed!
```

## Options Analysis

### Option 1: Post-Processing Plugin to Strip Query Parameters

Add a third plugin that runs after `jay-stack:code-split` but before `jay:runtime` to strip the `?jay-client`/`?jay-server` suffixes.

**Implementation:**

```typescript
export function jayStackCompiler(jayOptions: JayRollupConfig = {}): Plugin[] {
  return [
    {
      name: 'jay-stack:code-split',
      enforce: 'pre',
      transform(code, id) {
        /* ... add ?jay-client/server to imports */
      },
    },
    {
      name: 'jay-stack:strip-query-params',
      enforce: 'pre',
      transform(code, id) {
        // Strip ?jay-client and ?jay-server from import paths
        // before jay:runtime sees them
        return code.replace(/\?jay-client/g, '').replace(/\?jay-server/g, '');
      },
    },
    jayRuntime(jayOptions),
  ];
}
```

**Pros:**

- ✅ Simple to implement
- ✅ Minimal changes to existing code
- ✅ Quick fix for the immediate problem

**Cons:**

- ❌ Feels like a workaround, not a proper solution
- ❌ Plugin chain becomes more complex (3 plugins instead of 2)
- ❌ Fragile - relies on plugin ordering
- ❌ Doesn't solve the underlying architectural issue
- ❌ Code does a lot of work adding query params just to remove them immediately
- ❌ The `resolveId` hook still sees the query params - only `transform` is fixed

### Option 2: Universal Utility for Environment Metadata on Imports

Create a shared utility in `@jay-framework/compiler-shared` that:

1. Provides a consistent API for adding/removing/detecting environment query parameters
2. Works for both `?jay-client`/`?jay-server` AND `?jay-main-sandbox`/`?jay-worker-*`
3. Is used by both `jay-stack-compiler` and `jay-plugin`

**Implementation:**

```typescript
// In @jay-framework/compiler-shared

export enum JayEnvironment {
  Client = 'client',
  Server = 'server',
  MainSandbox = 'main-sandbox',
  WorkerTrusted = 'worker-trusted',
  WorkerSandbox = 'worker-sandbox',
}

export const JAY_QUERY_PREFIX = '?jay-';

/**
 * Parse a module specifier to extract the base path and any jay environment
 */
export function parseJayModuleSpecifier(specifier: string): {
  basePath: string;
  environment?: JayEnvironment;
  queryParams: string;
} {
  const queryIndex = specifier.indexOf('?');
  if (queryIndex === -1) {
    return { basePath: specifier, queryParams: '' };
  }

  const basePath = specifier.substring(0, queryIndex);
  const queryString = specifier.substring(queryIndex);

  // Extract jay environment from query
  for (const env of Object.values(JayEnvironment)) {
    const jayQuery = `${JAY_QUERY_PREFIX}${env}`;
    if (queryString.includes(jayQuery)) {
      // Remove jay query from remaining params
      const remainingParams = queryString
        .replace(jayQuery, '')
        .replace(/^\?&/, '?')
        .replace(/&$/, '')
        .replace(/^&/, '');
      return {
        basePath,
        environment: env,
        queryParams: remainingParams || '',
      };
    }
  }

  return { basePath, queryParams: queryString };
}

/**
 * Add jay environment to a module specifier
 */
export function addJayEnvironment(specifier: string, environment: JayEnvironment): string {
  const { basePath, queryParams } = parseJayModuleSpecifier(specifier);
  const jayQuery = `${JAY_QUERY_PREFIX}${environment}`;

  if (queryParams) {
    return `${basePath}${jayQuery}&${queryParams.substring(1)}`;
  }
  return `${basePath}${jayQuery}`;
}

/**
 * Check if a module specifier has a jay extension (ignoring query params)
 */
export function hasJayExtension(specifier: string, extension: string): boolean {
  const { basePath } = parseJayModuleSpecifier(specifier);
  return basePath.endsWith(extension);
}
```

**Updated jay-plugin usage:**

```typescript
// In rollup-plugin/lib/runtime/runtime-compiler.ts
async resolveId(source, importer, options) {
    // Use the new utility to check extensions
    if (hasJayExtension(source, JAY_EXTENSION)) {
        return await resolveJayHtml(this, source, importer, options, ...);
    }
    if (hasJayExtension(source, JAY_CONTRACT_EXTENSION)) {
        return await resolveJayContract(this, source, importer, options);
    }
    // ... etc
}
```

**Pros:**

- ✅ Clean architecture - single source of truth
- ✅ Both plugins use the same logic
- ✅ Extensible for future environments
- ✅ Properly handles all edge cases
- ✅ Makes extension detection work correctly with any query params
- ✅ Can combine multiple environments if needed (e.g., `?jay-client&jay-worker-trusted`)

**Cons:**

- ❌ More upfront work
- ❌ Requires changes to both plugins
- ❌ Need to update all places that check for extensions

### Option 3: Hybrid - Exclude Certain Files from Query Param Addition

Instead of adding query params to ALL local imports, be selective:

```typescript
function shouldAddQueryParam(modulePath: string): boolean {
  // Don't add query params to contract files - they're just types
  if (modulePath.endsWith('.jay-contract')) return false;
  // Don't add to jay-html files - they're templates
  if (modulePath.endsWith('.jay-html') || modulePath.endsWith('.jay')) return false;
  // Add to everything else
  return true;
}
```

**Pros:**

- ✅ Quick to implement
- ✅ Minimal changes
- ✅ Contract files work correctly

**Cons:**

- ❌ Inconsistent - some imports get query params, some don't
- ❌ If a contract file imports another local file, that file won't get the query param
- ❌ Doesn't solve the collision issue with sandbox params
- ❌ Requires maintaining a list of exceptions

## Recommendation

**Option 2: Universal Utility** is the recommended approach.

### Rationale

1. **Architectural Consistency**: Both the security sandbox transformations and the client/server code splitting are fundamentally the same pattern - adding environment metadata to imports. They should use the same infrastructure.

2. **Future-Proof**: As Jay evolves, there may be more environment dimensions (e.g., SSR vs CSR, development vs production). A universal utility makes it easy to add these.

3. **Correctness**: The current `hasExtension()` function is brittle - it doesn't handle query parameters at all. This bug exists independently of our changes and should be fixed.

4. **Composability**: With a proper utility, you could have a file that's both `?jay-client` and `?jay-worker-trusted` - the environments are orthogonal.

5. **Maintainability**: One place to understand and modify, rather than scattered string manipulation.

### Implementation Plan

**Phase 1: Create Shared Utility**

- Add `parseJayModuleSpecifier()`, `addJayEnvironment()`, `hasJayExtension()` to `compiler-shared`
- Add unit tests for the utility

**Phase 2: Update jay-plugin**

- Replace direct `hasExtension()` calls with `hasJayExtension()` for jay-specific extensions
- Update `resolveId` to use the new parsing
- Ensure existing sandbox query params still work

**Phase 3: Update jay-stack-compiler**

- Use `addJayEnvironment()` instead of string concatenation
- Remove hardcoded `?jay-client` / `?jay-server` strings

**Phase 4: Testing**

- Test mood-tracker-plugin build
- Test contract file imports with query params
- Test combination of client/server + sandbox environments

## Alternative Consideration

If Option 2 is too much work for immediate needs, **Option 3 (Hybrid)** could be a quick interim solution. Contract files are type-only imports that don't contain runtime code, so they don't need the environment query param. However, this should be considered technical debt to be addressed later.

## Open Questions

1. **Should contract files get environment query params at all?** They're type-only - the answer might be "no" regardless of the solution we choose.

2. **How do we handle the case where both sandbox AND client/server params are needed?** Option 2 handles this naturally; other options might struggle.

3. **Should we consolidate all environment-related query params into a single query param format?** e.g., `?jay-env=client,worker-trusted` instead of multiple `?jay-*` params.

---

**Status**: ✅ Implemented (Option 2)

---

## Implementation Summary

### Changes Made

**1. New Shared Utilities (`compiler-shared/lib/jay-module-specifier.ts`)**:

- `JayBuildEnvironment` enum: `Client`, `Server`
- `parseJayModuleSpecifier()`: Parses module specifiers to separate base path from query params
- `addBuildEnvironment()`: Adds `?jay-client` or `?jay-server` to a module path
- `hasJayExtension()`: Query-param-aware extension detection (replaces `hasExtension` for Jay files)
- `getBasePath()`: Gets the base path without query parameters
- `isLocalModule()`: Checks if a path is a local file (relative path)
- `hasBuildEnvironment()`: Checks if a module has a build environment query param

**2. Updated Jay Plugin (`rollup-plugin`)**:

- `resolveId`: Uses `hasJayExtension()` for detecting `.jay-html` and `.jay-contract` files
- `resolveJayHtml`/`resolveJayContract`: Parse query params and add `.ts` extension BEFORE the query params
- `load`: Contract files are now compiled to TypeScript in the `load` hook (not `transform`)
- `transform`: Uses `hasJayExtension()` for file detection
- `getFileContext`: Strips query params before extracting filename/dirname

**3. Updated Jay Stack Compiler (`compiler-jay-stack`)**:

- Uses `addBuildEnvironment()` instead of manual string concatenation
- Uses `isLocalModule()` from shared utilities
- Uses `hasBuildEnvironment()` to check if query param already exists

### Key Insight: Contract Compilation in Load Hook

The critical fix was moving contract YAML compilation from `transform` to `load`:

```
Before: load → (esbuild mangles YAML) → transform → compile
After:  load → compile to TS → (esbuild sees valid TS) → transform (no-op)
```

esbuild runs between `load` and `transform` hooks, so the contract must be valid TypeScript by the time esbuild sees it.

### Test Results

- ✅ `compiler-shared`: 45 tests passing (including new module specifier tests)
- ✅ `compiler-jay-stack`: 12 tests passing
- ✅ `mood-tracker-plugin`: Builds successfully with dual outputs

**Estimated Effort**:

- Option 1: ~1 hour
- Option 2: ~4-6 hours (actual: ~3 hours)
- Option 3: ~30 minutes

**Recommended**: Option 2 for long-term architecture, with Option 3 as a possible interim fix if time is critical.

---

## Critical Fix: Module Identity Preservation

### Problem Discovered During Testing

After implementing Option 2, the `fake-shop` example failed with "Service not found" errors. Root cause: **query parameters on imports break module identity**.

When `page.ts?jay-server` imports `products-database`, Vite treats it as a different module than when `jay.init.ts` imports `products-database`. This caused service tokens (symbols) registered in `jay.init.ts` to be different from those looked up in page components.

### Solution: Asymmetric Query Param Strategy

**Server builds**: No query params → preserves module identity
**Client builds**: `?jay-client` → separate modules (acceptable for client bundles)

### Key Changes

1. **`compiler-jay-stack/lib/index.ts`**: Detect environment automatically:

   - `?jay-client` → client build (explicit)
   - `?jay-server` → server build (backward compat)
   - SSR mode (`options.ssr === true`) → server build (automatic)
   - No signals → no transformation

2. **`compiler-jay-stack/lib/transform-jay-stack-builder.ts`**: Only propagate `?jay-client` to imports for client builds. Server builds leave imports unchanged.

3. **`stack-server-runtime/lib/load-page-parts.ts`**: Removed `?jay-server` from `ssrLoadModule()` calls. SSR mode is detected automatically by the transformer.

### Why This Works

```
jay.init.ts imports products-database     → /path/products-database (module A)
page.ts (SSR) imports products-database   → /path/products-database (module A) ✓ SAME

page.ts?jay-client imports products-database?jay-client → separate module (OK for client)
```

Server-side code shares module identity, so service tokens work correctly.
