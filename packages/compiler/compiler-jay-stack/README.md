# @jay-framework/compiler-jay-stack

Vite/Rollup plugin for Jay Stack that provides **bidirectional code splitting** between client and server environments.

## What It Does

This plugin automatically splits Jay Stack component builder chains into environment-specific code:

- **Client builds**: Strips server-only code (`withServices`, `withLoadParams`, `withSlowlyRender`, `withFastRender`)
- **Server builds**: Strips client-only code (`withInteractive`, `withContexts`)

This prevents:
- ❌ Server secrets leaking to client bundles
- ❌ Browser APIs crashing Node.js server
- ❌ Unnecessary code bloat in both environments

## Installation

```bash
yarn add -D @jay-framework/compiler-jay-stack
```

## Usage

### For Jay Stack Applications

Replace `jayRuntime()` with `jayStackCompiler()`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';

export default defineConfig({
  plugins: [
    ...jayStackCompiler({
      tsConfigFilePath: './tsconfig.json',
    }),
  ],
});
```

The plugin internally composes the `jay:runtime` plugin, so you only need one import.

### For Jay Stack Packages (Reusable Components)

Build both server and client bundles:

```typescript
// vite.config.ts for a Jay Stack package
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { jayStackCompiler, JayRollupConfig } from '@jay-framework/compiler-jay-stack';

const jayOptions: JayRollupConfig = {
  tsConfigFilePath: resolve(__dirname, 'tsconfig.json'),
};

export default defineConfig({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    lib: {
      entry: {
        // Server build (client code stripped)
        'index': resolve(__dirname, 'lib/index.ts?jay-server'),
        // Client build (server code stripped)
        'index.client': resolve(__dirname, 'lib/index.ts?jay-client'),
      },
      formats: ['es'],
    },
  },
});
```

Update `package.json` exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/index.client.js"
  }
}
```

## How It Works

### Query Parameters

- `?jay-client` - Transform file to client-only code
- `?jay-server` - Transform file to server-only code
- No query - Use original code (not recommended for Jay Stack components)

### Example Transformation

**Input (page.ts):**
```typescript
import { DATABASE } from './database';
import { Interactive } from './interactive';

export const page = makeJayStackComponent()
    .withServices(DATABASE)
    .withSlowlyRender(async () => { /* ... */ })
    .withInteractive(Interactive);
```

**Server Build (`?jay-server`):**
```typescript
import { DATABASE } from './database';

export const page = makeJayStackComponent()
    .withServices(DATABASE)
    .withSlowlyRender(async () => { /* ... */ });
// ✅ No withInteractive - prevents browser API crashes
```

**Client Build (`?jay-client`):**
```typescript
import { Interactive } from './interactive';

export const page = makeJayStackComponent()
    .withInteractive(Interactive);
// ✅ No server code - smaller bundle, no secrets
```

## Method Classification

| Method | Server | Client | Shared |
|--------|--------|--------|--------|
| `withProps()` | ✅ | ✅ | ✅ |
| `withServices()` | ✅ | ❌ | |
| `withContexts()` | ❌ | ✅ | |
| `withLoadParams()` | ✅ | ❌ | |
| `withSlowlyRender()` | ✅ | ❌ | |
| `withFastRender()` | ✅ | ❌ | |
| `withInteractive()` | ❌ | ✅ | |

## Architecture

This plugin is a composite of two plugins:

1. **jay-stack:code-split** (runs first, `enforce: 'pre'`)
   - Strips environment-specific builder methods
   - Removes unused imports
   - Uses TypeScript AST transformation

2. **jay:runtime** (runs second)
   - Handles `.jay-html` and `.jay-contract` compilation
   - Standard Jay runtime compilation

## Benefits

### For Developers
- ✅ Write components in one place
- ✅ Full TypeScript type safety
- ✅ No manual code organization needed

### For Applications
- ✅ Prevents runtime crashes (no browser APIs on server)
- ✅ Smaller client bundles (no server code)
- ✅ Smaller server bundles (no client code)
- ✅ Better security (server secrets can't leak)

### For Package Authors
- ✅ One plugin handles both builds
- ✅ Standard npm export patterns
- ✅ Automatic optimization for consumers

## Migration

### From `jayRuntime()`

```diff
- import { jayRuntime } from '@jay-framework/vite-plugin';
+ import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';

export default defineConfig({
  plugins: [
-   jayRuntime(config),
+   ...jayStackCompiler(config),
  ],
});
```

### Package.json Dependencies

```diff
{
  "dependencies": {
-   "@jay-framework/vite-plugin": "workspace:^",
+   "@jay-framework/compiler-jay-stack": "workspace:^",
  }
}
```

## Technical Details

### AST Transformation

The plugin uses:
- `SourceFileBindingResolver` - Tracks identifier origins
- `SourceFileStatementDependencies` - Builds dependency graph
- TypeScript compiler API - Safe AST transformations

These utilities are battle-tested from Jay's security transformations.

### Import Detection

For headless components:
- **Local files** (`./`, `../`): Use `?jay-client` query
- **npm packages**: Use `/client` export path

Example:
```typescript
// Local component
import { comp } from './my-component?jay-client';

// npm package
import { comp } from 'my-plugin/client';
```

## Debugging

If transformation fails, check:
1. Are you using method chaining? (Conditional composition not supported yet)
2. Are your imports used elsewhere? (They won't be removed)
3. Check console for transformation errors

## See Also

- [Design Log #52](../../../design-log/52%20-%20jay-stack%20client-server%20code%20splitting.md) - Full design documentation
- [@jay-framework/fullstack-component](../full-stack-component/README.md) - Jay Stack component builder
- [@jay-framework/dev-server](../dev-server/README.md) - Jay Stack dev server

## License

Apache-2.0

