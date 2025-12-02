# Jay Stack Client-Server Code Splitting

## Background

From Design Log #34 (Jay Stack) and #50 (Rendering Phases), we have established that Jay Stack components have three rendering phases:

1. **Slowly changing (server-only)**: Build-time/request-time static data rendering
2. **Fast changing (server-only)**: Request-time dynamic data rendering
3. **Interactive (client-only)**: Client-side interactivity and state management

The builder API for Jay Stack components intentionally mixes client and server concerns in a single component definition:

```typescript
export const categoryPage = makeJayStackComponent<CategoryPageContract>()
  .withProps<PageProps>()
  .withServices(WIX_STORES_SERVICE_MARKER) // Server-only
  .withLoadParams(loadCategoryParams) // Server-only
  .withSlowlyRender(renderSlowlyChanging) // Server-only
  .withFastRender(renderFastChanging) // Server-only
  .withInteractive(CategoryPageInteractive); // Client-only
```

This unified API provides excellent developer experience - all component logic in one place with full type safety. However, it creates a **critical build-time challenge**.

## Problem Statement

Currently, the full component definition (including all server and client code) is imported by both environments:

1. **Server bundle**: Imports the full component, runs server methods (`withServices`, `withLoadParams`, `withSlowlyRender`, `withFastRender`)
2. **Client bundle**: Imports the full component to access `withInteractive`, `withContexts`

This causes several problems:

### 1. Bundle Bloat

- **Client bundles** include all server code (database logic, service implementations, server-only imports)
- **Server bundles** include client-only code (interactive handlers, browser APIs)

### 2. Security Risks

- Server secrets, API keys, database queries could leak to client bundle
- Server-only dependencies expose unnecessary attack surface

### 3. Build Failures (Critical Issue!)

- **Client builds**: Server-only Node.js imports (e.g., `node:fs`, `node:crypto`) fail in browser builds
- **Server builds**: Client-only browser APIs (e.g., `document`, `window`, `addEventListener`) crash Node.js ❌
- **SSR**: Server tries to execute `withInteractive` code that calls `document.getElementById()` → Runtime error

### 4. Type Safety Gaps

- No compile-time guarantee that server code stays on server
- No compile-time guarantee that client code doesn't use browser APIs on server
- No way to verify client bundle doesn't include server secrets

## Current Implementation Analysis

### How Client Scripts Are Generated

From `packages/jay-stack/stack-server-runtime/lib/generate-client-script.ts`:

```typescript
export function generateClientScript(
  defaultViewState: object,
  fastCarryForward: object,
  parts: DevServerPagePart[],
  jayHtmlPath: string,
) {
  const imports = parts.map((part) => part.clientImport).join('\n');
  const compositeParts = parts.map((part) => part.clientPart);

  return `<!doctype html>
    <script type="module">
      import {makeCompositeJayComponent} from "@jay-framework/stack-client-runtime";
      import { render } from '${jayHtmlPath}';
      ${imports}  // ⚠️ Imports full component definitions
      
      const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, ${compositeParts})
    </script>`;
}
```

From `packages/jay-stack/stack-server-runtime/lib/load-page-parts.ts`:

```typescript
const pageComponent = (await vite.ssrLoadModule(route.compPath)).page;
parts.push({
  compDefinition: pageComponent,
  clientImport: `import {page} from '${route.compPath}'`, // ⚠️ Full import
  clientPart: `{comp: page.comp, contextMarkers: []}`, // ⚠️ Accesses .comp which has all code
});
```

The problem: `page.comp` contains the client-side component constructor, but to access it, we import the entire `page` object which includes all the server-side methods.

### Current Builder Structure

From `packages/jay-stack/full-stack-component/lib/jay-stack-builder.ts`:

```typescript
class BuilderImplementation<...> {
    services: Services = [] as any;
    contexts: Contexts = [] as any;
    loadParams?: LoadParams<Services, Params>;      // Server-only
    slowlyRender?: RenderSlowly<Services, PropsT, SlowVS, any>;  // Server-only
    fastRender?: RenderFast<Services, PropsT, FastVS, any>;      // Server-only
    comp?: ComponentConstructor<...>;                            // Client-only

    withProps<NewPropsT extends object>()
    withServices(...serviceMarkers: NewServices) { /*...*/ }
    withContexts(...contextMarkers: ContextMarkers<NewContexts>) { /*...*/ }
    withLoadParams(loadParams: LoadParams<...>) { /*...*/ }
    withSlowlyRender(slowlyRender: RenderSlowly<...>) { /*...*/ }
    withFastRender(fastRender: RenderFast<...>) { /*...*/ }
    withInteractive(comp: ComponentConstructor<...>) { /*...*/ }
}
```

## Solution: Build-Time Code Splitting via Custom Vite Plugin

### Core Approach

Create a custom Vite plugin that performs **AST-based code transformation** to generate separate client and server entry points from the same source file.

**Key Principle**: Split at build time, not runtime. The bundler sees different code based on the environment.

### Solution Architecture

```
Source File (page.ts)
├── Server Build (?jay-server or default)
│   ├── Vite Plugin: Strip client code ✅
│   └── Output: Server-only bundle
│       ├── withProps ✅
│       ├── withServices ✅
│       ├── withContexts ❌ (removed - client-only)
│       ├── withLoadParams ✅
│       ├── withSlowlyRender ✅
│       ├── withFastRender ✅
│       └── withInteractive ❌ (removed - may use browser APIs)
│
└── Client Build (?jay-client)
    ├── Vite Plugin: Strip server code ✅
    └── Output: Client-only bundle
        ├── withProps ✅
        ├── withServices ❌ (removed - server-only)
        ├── withContexts ✅
        ├── withLoadParams ❌ (removed - server-only)
        ├── withSlowlyRender ❌ (removed - server-only)
        ├── withFastRender ❌ (removed - server-only)
        └── withInteractive ✅
```

### Technical Design

#### 1. Virtual Module Pattern

Instead of directly importing `page.ts`, we create virtual modules:

```typescript
// For server (existing behavior)
import { page } from './page.ts';

// For client (new virtual module)
import { page } from './page.ts?jay-client';
```

**Query Parameter Strategy:**

- `?jay-client` → Strip server code (withServices, withLoadParams, withSlowlyRender, withFastRender)
- `?jay-server` → Strip client code (withInteractive, withContexts)
- No query param → Use original code (for server, but with potential runtime issues)

#### 2. AST Transformation Strategy

Using TypeScript's compiler API to transform the builder chain:

**Input (page.ts):**

```typescript
export const page = makeJayStackComponent<MyContract>()
  .withProps<PageProps>()
  .withServices(DATABASE_SERVICE) // Server
  .withContexts() // Client
  .withLoadParams(loadParams) // Server
  .withSlowlyRender(renderSlowly) // Server
  .withFastRender(renderFast) // Server
  .withInteractive(InteractiveComponent); // Client
```

**Output for Client (page.ts?jay-client):**

```typescript
export const page = makeJayStackComponent<MyContract>()
  .withProps<PageProps>()
  .withContexts()
  .withInteractive(InteractiveComponent);
```

**Output for Server (page.ts - unchanged):**

```typescript
export const page = makeJayStackComponent<MyContract>()
  .withProps<PageProps>()
  .withServices(DATABASE_SERVICE)
  .withLoadParams(loadParams)
  .withSlowlyRender(renderSlowly)
  .withFastRender(renderFast);
```

#### 3. Import Stripping

When stripping builder methods, we must also remove their corresponding imports:

**Input:**

```typescript
import { DATABASE_SERVICE } from './database';
import { loadParams } from './loaders';
import { renderSlowly, renderFast } from './renderers';
import { InteractiveComponent } from './interactive';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent<MyContract>()
  .withServices(DATABASE_SERVICE)
  .withLoadParams(loadParams)
  .withSlowlyRender(renderSlowly)
  .withFastRender(renderFast)
  .withInteractive(InteractiveComponent);
```

**Client Output:**

```typescript
import { InteractiveComponent } from './interactive';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent<MyContract>().withInteractive(InteractiveComponent);
```

**Algorithm**:

1. Identify which builder methods are being removed
2. Track which identifiers those methods reference
3. Find import declarations for those identifiers
4. Remove unused imports (if not used elsewhere)

#### 4. Type Safety Preservation

The client bundle still needs type information for proper TypeScript compilation:

```typescript
// Client build still sees type parameters
export const page = makeJayStackComponent<MyContract>() // ✅ Type preserved
  .withProps<PageProps>() // ✅ Type preserved
  .withInteractive(InteractiveComponent);
```

Types are preserved but runtime implementations are stripped.

## Implementation Plan

### Decision: Extend Existing Jay Runtime Plugin vs New Plugin

After reviewing the existing compiler infrastructure, we have two options:

**Option A: Extend `jay:runtime` plugin** (`packages/compiler/rollup-plugin`)

- ✅ Leverages existing utilities (`SourceFileBindingResolver`, `SourceFileStatementDependencies`)
- ✅ Consistent with existing security transformations
- ✅ Already integrated into build pipeline
- ⚠️ More complex codebase, higher learning curve
- ⚠️ Mixes jay-stack concerns with general runtime concerns

**Option B: Create standalone `jay-stack:code-split` plugin**

- ✅ Focused, single responsibility
- ✅ Easier to understand and maintain
- ✅ Can still use utilities from `@jay-framework/compiler`
- ⚠️ Requires separate integration step
- ⚠️ Potential for conflicts with jay:runtime plugin

**Recommendation**: **Option B with Composition** - Create standalone `jay-stack-compiler` plugin that internally uses `jay:runtime` plugin.

**Rationale**:

- The code splitting concern is specific to jay-stack, not the general Jay runtime
- By composing the plugins internally, developers only need to specify one plugin in their Vite config
- Simplifies the mental model: "Use `jayStackCompiler()` for Jay Stack projects"
- Still maintains separation of concerns at the code level

### Phase 1: Create the Jay Stack Compiler Plugin

**Package Location:** `packages/jay-stack/jay-stack-compiler/`

**Files to Create:**

- `packages/jay-stack/jay-stack-compiler/lib/index.ts` - Main plugin export (composes jay:runtime)
- `packages/jay-stack/jay-stack-compiler/lib/transform-jay-stack-builder.ts` - AST transformation logic
- `packages/jay-stack/jay-stack-compiler/lib/find-builder-methods.ts` - Find and classify builder methods
- `packages/jay-stack/jay-stack-compiler/package.json` - Package definition
- `packages/jay-stack/jay-stack-compiler/tsconfig.json` - TypeScript config
- `packages/jay-stack/jay-stack-compiler/vite.config.ts` - Build config

**Plugin Structure (composing jay:runtime internally):**

```typescript
// lib/index.ts
import { Plugin } from 'vite';
import { jayRuntime, JayRollupConfig } from '@jay-framework/vite-plugin';
import { transformJayStackBuilder } from './transform-jay-stack-builder';

export type BuildEnvironment = 'client' | 'server';

/**
 * Jay Stack Compiler - Handles both Jay runtime compilation and Jay Stack code splitting
 *
 * This plugin internally uses the jay:runtime plugin and adds Jay Stack-specific
 * transformations for client/server code splitting.
 *
 * @param jayOptions - Configuration for Jay runtime (passed to jay:runtime plugin)
 */
export function jayStackCompiler(jayOptions: JayRollupConfig = {}): Plugin[] {
  return [
    // First: Jay Stack code splitting transformation
    {
      name: 'jay-stack:code-split',
      enforce: 'pre', // Run before jay:runtime

      transform(code: string, id: string) {
        // Check for environment query params
        const isClientBuild = id.includes('?jay-client');
        const isServerBuild = id.includes('?jay-server');

        if (!isClientBuild && !isServerBuild) {
          return null; // No transformation needed
        }

        const environment: BuildEnvironment = isClientBuild ? 'client' : 'server';

        // Transform using existing compiler utilities
        return transformJayStackBuilder(code, id, environment);
      },
    },

    // Second: Jay runtime compilation (existing plugin)
    jayRuntime(jayOptions),
  ];
}
```

**Transformation Logic (using existing patterns from transform-component.ts):**

```typescript
// lib/transform-jay-stack-builder.ts
import type * as ts from 'typescript';
import tsBridge from '@jay-framework/typescript-bridge';
import { SourceFileBindingResolver } from '@jay-framework/compiler';
import { SourceFileStatementDependencies } from '@jay-framework/compiler';
import { BuildEnvironment } from './index';

const {
  transform,
  createPrinter,
  createSourceFile,
  ScriptTarget,
  visitEachChild,
  isCallExpression,
  isPropertyAccessExpression,
} = tsBridge;

const SERVER_METHODS = new Set([
  'withServices',
  'withLoadParams',
  'withSlowlyRender',
  'withFastRender',
]);

const CLIENT_METHODS = new Set(['withInteractive', 'withContexts']);

const SHARED_METHODS = new Set(['withProps']);

export function transformJayStackBuilder(
  code: string,
  filePath: string,
  environment: BuildEnvironment,
): { code: string; map?: any } {
  // Parse to AST
  const sourceFile = createSourceFile(filePath, code, ScriptTarget.Latest, true);

  // Create binding resolver to track identifiers
  const bindingResolver = new SourceFileBindingResolver(sourceFile);

  // Create statement dependencies tracker
  const statementDeps = new SourceFileStatementDependencies(sourceFile, bindingResolver);

  // Transform based on environment
  const result = transform(sourceFile, [
    (context) => mkCodeSplitTransformer(context, bindingResolver, statementDeps, environment),
  ]);

  const printer = createPrinter();
  const transformedFile = result.transformed[0];
  const transformedCode = printer.printFile(transformedFile as ts.SourceFile);

  result.dispose();

  return {
    code: transformedCode,
    // TODO: Generate source map
  };
}

function mkCodeSplitTransformer(
  context: ts.TransformationContext,
  bindingResolver: SourceFileBindingResolver,
  statementDeps: SourceFileStatementDependencies,
  environment: BuildEnvironment,
) {
  return (sourceFile: ts.SourceFile): ts.SourceFile => {
    // Track which identifiers are referenced by removed methods
    const removedIdentifiers = new Set<string>();

    // First pass: identify and strip unwanted methods
    const stripMethodsVisitor = (node: ts.Node): ts.Node | undefined => {
      if (isCallExpression(node) && isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text;

        const shouldRemove =
          (environment === 'client' && SERVER_METHODS.has(methodName)) ||
          (environment === 'server' && CLIENT_METHODS.has(methodName));

        if (shouldRemove) {
          // Track identifiers used in this method call's arguments
          trackRemovedIdentifiers(node.arguments, bindingResolver, removedIdentifiers);

          // Return the object being called on (strip this method call)
          return visitEachChild(node.expression.expression, stripMethodsVisitor, context);
        }
      }

      return visitEachChild(node, stripMethodsVisitor, context);
    };

    let transformedSourceFile = visitEachChild(sourceFile, stripMethodsVisitor, context);

    // Second pass: remove unused imports using statement dependencies
    transformedSourceFile = removeUnusedImports(
      transformedSourceFile,
      context,
      bindingResolver,
      statementDeps,
      removedIdentifiers,
    );

    return transformedSourceFile;
  };
}

function trackRemovedIdentifiers(
  args: ts.NodeArray<ts.Expression>,
  bindingResolver: SourceFileBindingResolver,
  removedIdentifiers: Set<string>,
) {
  const visitor = (node: ts.Node) => {
    if (ts.isIdentifier(node)) {
      const variable = bindingResolver.explain(node);
      if (variable?.name) {
        removedIdentifiers.add(variable.name);
      }
    }
    node.forEachChild(visitor);
  };

  args.forEach((arg) => visitor(arg));
}

function removeUnusedImports(
  sourceFile: ts.SourceFile,
  context: ts.TransformationContext,
  bindingResolver: SourceFileBindingResolver,
  statementDeps: SourceFileStatementDependencies,
  removedIdentifiers: Set<string>,
): ts.SourceFile {
  // Use SourceFileStatementDependencies to identify statements that can be removed
  const statementsToRemove = new Set<ts.Statement>();

  for (const statementDep of statementDeps.getAllStatements()) {
    const statement = statementDep.statement;

    // Check if this statement only supports removed identifiers
    if (ts.isImportDeclaration(statement)) {
      const importClause = statement.importClause;
      if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        const stillUsedElements = importClause.namedBindings.elements.filter(
          (element) => !removedIdentifiers.has(element.name.text),
        );

        if (stillUsedElements.length === 0) {
          statementsToRemove.add(statement);
        } else if (stillUsedElements.length < importClause.namedBindings.elements.length) {
          // Partially used import - will handle in visitor
        }
      }
    }
  }

  // Filter out removed statements
  const visitor = (node: ts.Node): ts.Node | undefined => {
    if (statementsToRemove.has(node as ts.Statement)) {
      return undefined;
    }

    // Handle partially removed imports
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        const stillUsedElements = importClause.namedBindings.elements.filter(
          (element) => !removedIdentifiers.has(element.name.text),
        );

        if (
          stillUsedElements.length > 0 &&
          stillUsedElements.length < importClause.namedBindings.elements.length
        ) {
          // Update import to only include used elements
          return context.factory.updateImportDeclaration(
            node,
            node.modifiers,
            context.factory.updateImportClause(
              importClause,
              importClause.isTypeOnly,
              importClause.name,
              context.factory.updateNamedImports(importClause.namedBindings, stillUsedElements),
            ),
            node.moduleSpecifier,
            node.assertClause,
          );
        }
      }
    }

    return visitEachChild(node, visitor, context);
  };

  return visitEachChild(sourceFile, visitor, context) as ts.SourceFile;
}
```

**Builder Method Finder:**

```typescript
// lib/find-builder-methods.ts
import type * as ts from 'typescript';
import { SourceFileBindingResolver } from '@jay-framework/compiler';

export interface FoundBuilderMethod {
  methodName: string;
  callExpression: ts.CallExpression;
  arguments: ts.NodeArray<ts.Expression>;
}

export function findJayStackBuilderMethods(
  sourceFile: ts.SourceFile,
  bindingResolver: SourceFileBindingResolver,
): FoundBuilderMethod[] {
  const builderMethods: FoundBuilderMethod[] = [];

  const visitor = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text;

      // Check if this is a builder method
      if (isBuilderMethod(methodName)) {
        builderMethods.push({
          methodName,
          callExpression: node,
          arguments: node.arguments,
        });
      }
    }

    ts.forEachChild(node, visitor);
  };

  ts.forEachChild(sourceFile, visitor);
  return builderMethods;
}

function isBuilderMethod(methodName: string): boolean {
  return [
    'withProps',
    'withServices',
    'withContexts',
    'withLoadParams',
    'withSlowlyRender',
    'withFastRender',
    'withInteractive',
  ].includes(methodName);
}
```

**Package Configuration:**

```json
// packages/jay-stack/jay-stack-compiler/package.json
{
  "name": "@jay-framework/jay-stack-compiler",
  "version": "0.8.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "files": ["dist", "readme.md"],
  "scripts": {
    "build": "npm run build:js && npm run build:types",
    "build:watch": "npm run build:js -- --watch & npm run build:types -- --watch",
    "build:js": "vite build",
    "build:types": "tsup lib/index.ts --dts-only --format esm",
    "build:check-types": "tsc",
    "clean": "rimraf dist",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@jay-framework/compiler": "workspace:^",
    "@jay-framework/typescript-bridge": "workspace:^",
    "@jay-framework/vite-plugin": "workspace:^",
    "vite": "^5.0.11"
  },
  "devDependencies": {
    "@jay-framework/dev-environment": "workspace:^",
    "rimraf": "^5.0.5",
    "tsup": "^8.0.1",
    "typescript": "^5.3.3",
    "vitest": "^1.2.1"
  }
}
```

### Phase 2A: Update Client Script Generation

**File to Modify:** `packages/jay-stack/stack-server-runtime/lib/load-page-parts.ts`

**Change:**

```typescript
// Before:
parts.push({
  compDefinition: pageComponent,
  clientImport: `import {page} from '${route.compPath}'`,
  clientPart: `{comp: page.comp, contextMarkers: []}`,
});

// After:
parts.push({
  compDefinition: pageComponent,
  clientImport: `import {page} from '${route.compPath}?jay-client'`, // ✅ Virtual module
  clientPart: `{comp: page.comp, contextMarkers: []}`,
});
```

**Similarly for headless components:**

```typescript
// Before:
clientImport: `import {${name}} from '${moduleImport}'`,

// After - with npm package detection:
// Detect if this is an npm package or local file
const isNpmPackage = !module.startsWith('./') && !module.startsWith('../');
const clientModuleImport = isNpmPackage
    ? `${moduleImport}/client`        // npm: use /client export
    : `${moduleImport}?jay-client`;   // local: use ?jay-client query

clientImport: `import {${name}} from '${clientModuleImport}'`,
```

**Detection Logic:**

- **Local files** (relative paths like `./`, `../`): Use `?jay-client` query parameter
- **npm packages** (like `mood-tracker-plugin`): Use `/client` export path
- **Rationale**: Query parameters work well with Vite's virtual modules for local files, but package exports are more standard for npm packages

### Phase 2B: Support for Jay Stack Packages (Triple Builds)

Jay Stack packages (like `mood-tracker-plugin`) that export reusable components need to build **three separate bundles**:

1. **Server build** (for server imports): Contains only server code (client code stripped)
2. **Client build** (for client imports): Contains only client code (server code stripped)
3. **Full build** (optional, for compatibility): Contains all code (not recommended)

**Current Example - Mood Tracker Plugin:**

```typescript
// lib/mood-tracker.ts
export const moodTracker = makeJayStackComponent<MoodTrackerContract>()
  .withProps<MoodTrackerProps>()
  .withInteractive(MoodTracker);
```

**Current Build (Single Output):**

```json
// package.json
{
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js", // ❌ Has both client + server code
    "./mood-tracker.jay-contract": "./dist/mood-tracker.jay-contract"
  }
}
```

**New Build (Triple Outputs):**

**Updated vite.config.ts for Plugin Packages:**

```typescript
// examples/jay-stack/mood-tracker-plugin/vite.config.ts
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/jay-stack-compiler';

const root = resolve(__dirname);
const jayOptions: JayRollupConfig = {
  tsConfigFilePath: resolve(root, 'tsconfig.json'),
  outputDir: 'build/jay-runtime',
};

export default defineConfig({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    minify: false,
    target: 'es2020',

    // Build library with triple outputs
    lib: {
      entry: {
        // Server-only build (default)
        index: resolve(__dirname, 'lib/index.ts?jay-server'),
        // Client-only build
        'index.client': resolve(__dirname, 'lib/index.ts?jay-client'),
        // Full build (for compatibility, not recommended)
        // 'index.full': resolve(__dirname, 'lib/index.ts'),
      },
      formats: ['es'],
    },

    rollupOptions: {
      external: [
        '@jay-framework/component',
        '@jay-framework/fullstack-component',
        '@jay-framework/reactive',
        '@jay-framework/runtime',
        '@jay-framework/secure',
      ],
    },
  },
});
```

**Updated package.json Exports:**

```json
{
  "name": "example-jay-mood-tracker-plugin",
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js", // Server build (default) ✅
    "./client": "./dist/index.client.js", // Client build ✅
    "./mood-tracker.jay-contract": "./dist/mood-tracker.jay-contract"
  }
}
```

**Note:** The main export (`"."`) now points to the **server build** (`index.js`) which has client code stripped.

**How It Works:**

1. **Server-side imports** (in page.ts):

   ```typescript
   import { moodTracker } from 'mood-tracker-plugin';
   // Resolves to: dist/index.js (server build - NO browser APIs) ✅
   ```

2. **Client-side imports** (via load-page-parts.ts):
   ```typescript
   import { moodTracker } from 'mood-tracker-plugin/client';
   // Resolves to: dist/index.client.js (client build - NO server code) ✅
   ```

**Why Both Directions?**

```typescript
// WITHOUT server-side stripping:
export const moodTracker = makeJayStackComponent<MoodTrackerContract>().withInteractive(
  (props, refs) => {
    document.getElementById('root'); // ❌ CRASH on Node.js!
    return { render: () => ({}) };
  },
);

// Server tries to import this, Node.js doesn't have document → CRASH

// WITH server-side stripping:
export const moodTracker = makeJayStackComponent<MoodTrackerContract>();
// .withInteractive removed during build ✅
// Safe to import on server, no browser APIs
```

**Server Import Strategy:**

For local page files imported on the server, we should also use `?jay-server`:

```typescript
// In dev-server.ts or wherever pages are loaded on server
const pageComponent = (await vite.ssrLoadModule(route.compPath + '?jay-server')).page;
// This strips withInteractive, preventing browser API crashes
```

**Benefits of Bidirectional Stripping:**

- ✅ **Prevents runtime crashes**: Server doesn't try to execute browser APIs
- ✅ **Smaller server bundles**: No unnecessary client code
- ✅ **Faster server startup**: Less code to parse and load
- ✅ **Better error messages**: Build fails if browser APIs used, not runtime crash

**Build Script Updates:**

```json
// package.json scripts
{
  "scripts": {
    "build": "npm run definitions && npm run build:js && npm run build:copy-contract",
    "build:js": "vite build", // Now builds both index.js and index.client.js
    "build:copy-contract": "cp lib/*.jay-contract* dist/"
  }
}
```

**Benefits:**

- ✅ Jay Stack packages ship with both full and client-only builds
- ✅ Consumer projects automatically get the right build
- ✅ Smaller client bundles when using Jay Stack plugins
- ✅ Security: Server code from plugins doesn't leak to client

### Phase 3: Integrate Plugin into Build System

**File to Modify:** `packages/jay-stack/dev-server/lib/dev-server.ts`

**Before:**

```typescript
import { jayRuntime } from '@jay-framework/vite-plugin';

const vite = await createServer({
  server: { middlewareMode: true },
  plugins: [jayRuntime(jayRollupConfig)],
  // ...
});
```

**After:**

```typescript
import { jayStackCompiler } from '@jay-framework/jay-stack-compiler';

const vite = await createServer({
  server: { middlewareMode: true },
  plugins: [
    // ✅ Replaces jayRuntime - includes both code splitting and runtime compilation
    ...jayStackCompiler(jayRollupConfig),
  ],
  // ...
});
```

**Benefits of This Approach:**

- ✅ **Simple API**: Only one plugin for developers to think about
- ✅ **Correct ordering**: Code splitting automatically runs before jay:runtime
- ✅ **No conflicts**: Plugin composition handled internally
- ✅ **Backward compatible**: Same `JayRollupConfig` options
- ✅ **Clean migration**: Replace `jayRuntime()` with `...jayStackCompiler()`

**Alternative (if fine-grained control needed):**

```typescript
import { jayStackCompiler } from '@jay-framework/jay-stack-compiler';

// Can still pass all the same options
const vite = await createServer({
  plugins: [
    ...jayStackCompiler({
      tsConfigFilePath: './tsconfig.json',
      generationTarget: 'browser',
      // ... other JayRollupConfig options
    }),
  ],
});
```

**File to Consider:** `packages/jay-stack/stack-cli/lib/server.ts`

- Same integration pattern for production builds

**Update dev-server package.json:**

```json
{
  "dependencies": {
    "@jay-framework/jay-stack-compiler": "workspace:^"
    // Can remove @jay-framework/vite-plugin (it's now a transitive dependency)
    // ... other deps
  }
}
```

**Note on Plugin Array:**
The spread operator (`...jayStackCompiler()`) is needed because the function returns an array of plugins:

```typescript
[codeSplitPlugin, jayRuntimePlugin];
```

### Phase 4: Testing

**Create Test Suite:** `packages/jay-stack/vite-plugin-code-split/test/transform.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { transformCodeForEnvironment } from '../lib/transform';

describe('Code Splitting Transformation', () => {
  it('should strip server methods for client build', () => {
    const input = `
            import { DATABASE } from './db';
            import { Interactive } from './interactive';
            
            export const page = makeJayStackComponent()
                .withServices(DATABASE)
                .withSlowlyRender(async () => {})
                .withInteractive(Interactive);
        `;

    const result = transformCodeForEnvironment(input, 'test.ts', 'client');

    expect(result.code).not.toContain('withServices');
    expect(result.code).not.toContain('withSlowlyRender');
    expect(result.code).not.toContain('DATABASE');
    expect(result.code).toContain('withInteractive');
    expect(result.code).toContain('Interactive');
  });

  it('should preserve all code for server build', () => {
    const input = `
            export const page = makeJayStackComponent()
                .withServices(DATABASE)
                .withInteractive(Interactive);
        `;

    const result = transformCodeForEnvironment(input, 'test.ts', 'server');

    expect(result.code).toBe(input);
  });

  it('should handle complex method chains', () => {
    const input = `
            export const page = makeJayStackComponent<Contract>()
                .withProps<Props>()
                .withServices(DB, AUTH)
                .withContexts(ThemeContext)
                .withLoadParams(loadParams)
                .withSlowlyRender(renderSlow)
                .withFastRender(renderFast)
                .withInteractive(Component);
        `;

    const result = transformCodeForEnvironment(input, 'test.ts', 'client');

    expect(result.code).toContain('withProps<Props>()');
    expect(result.code).toContain('withContexts(ThemeContext)');
    expect(result.code).toContain('withInteractive(Component)');
    expect(result.code).not.toContain('withServices');
    expect(result.code).not.toContain('withLoadParams');
    expect(result.code).not.toContain('withSlowlyRender');
    expect(result.code).not.toContain('withFastRender');
  });

  it('should remove unused imports after stripping methods', () => {
    const input = `
            import { DATABASE } from './db';
            import { loadParams } from './loaders';
            import { Interactive } from './interactive';
            
            export const page = makeJayStackComponent()
                .withServices(DATABASE)
                .withLoadParams(loadParams)
                .withInteractive(Interactive);
        `;

    const result = transformCodeForEnvironment(input, 'test.ts', 'client');

    expect(result.code).not.toContain("from './db'");
    expect(result.code).not.toContain("from './loaders'");
    expect(result.code).toContain("from './interactive'");
  });

  it('should preserve imports used elsewhere', () => {
    const input = `
            import { DATABASE } from './db';
            
            export const page = makeJayStackComponent()
                .withServices(DATABASE);
            
            export const otherThing = DATABASE.query();
        `;

    const result = transformCodeForEnvironment(input, 'test.ts', 'client');

    // DATABASE is still used by otherThing, so import should remain
    expect(result.code).toContain("from './db'");
  });
});
```

**Integration Test:** `packages/jay-stack/vite-plugin-code-split/test/integration.test.ts`

Create a real Vite build and verify bundle contents don't include server code.

### Phase 5: Documentation

**Files to Update:**

- `packages/jay-stack/full-stack-component/README.md` - Add section on code splitting
- `packages/jay-stack/vite-plugin-code-split/README.md` - New plugin documentation
- `design-log/52 - jay-stack client-server code splitting.md` - This document, add implementation results

**Documentation Content:**

````markdown
## How Code Splitting Works

Jay Stack automatically splits your component code into client and server bundles:

### What Gets Split

**Server-only methods** (stripped from client bundle):

- `.withServices()` - Service dependencies
- `.withLoadParams()` - URL parameter loading
- `.withSlowlyRender()` - Build-time rendering
- `.withFastRender()` - Request-time rendering

**Client-only methods** (kept in client bundle):

- `.withInteractive()` - Interactive component constructor

**Shared methods** (kept in both bundles):

- `.withProps()` - Type information
- `.withContexts()` - Context markers

### How It Works

The Vite plugin automatically transforms your component definitions:

```typescript
// You write this (page.ts):
export const page = makeJayStackComponent<MyContract>()
  .withServices(DATABASE)
  .withSlowlyRender(renderSlowly)
  .withInteractive(Interactive);

// Server bundle sees this (unchanged):
export const page = makeJayStackComponent<MyContract>()
  .withServices(DATABASE)
  .withSlowlyRender(renderSlowly)
  .withInteractive(Interactive);

// Client bundle sees this (automatically transformed):
export const page = makeJayStackComponent<MyContract>().withInteractive(Interactive);
```
````

### Security Benefits

✅ Server secrets never included in client bundle
✅ Database queries not exposed to browser
✅ Server-only dependencies don't fail client builds
✅ Smaller client bundle sizes

### No Action Required

This happens automatically - you don't need to change how you write components!

```

## Examples

### Example 1: Jay Stack Package (Plugin) with Dual Builds

**Package Structure:**
```

mood-tracker-plugin/
├── lib/
│ ├── index.ts # Exports moodTracker
│ ├── mood-tracker.ts # Component definition
│ └── mood-tracker.jay-contract
├── dist/
│ ├── index.js # Full build (server)
│ ├── index.client.js # Client-only build ✅ NEW
│ └── mood-tracker.jay-contract
├── package.json
└── vite.config.ts

````

**Component Definition (lib/mood-tracker.ts):**
```typescript
import { makeJayStackComponent } from '@jay-framework/fullstack-component';

export const moodTracker = makeJayStackComponent<MoodTrackerContract>()
    .withProps<MoodTrackerProps>()
    .withInteractive(MoodTracker);  // Client-only
````

**Build Config (vite.config.ts):**

```typescript
import { jayStackCompiler } from '@jay-framework/jay-stack-compiler';

export default defineConfig({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'lib/index.ts'), // Full build
        'index.client': resolve(__dirname, 'lib/index.ts?jay-client'), // Client build
      },
      formats: ['es'],
    },
  },
});
```

**Package Exports (package.json):**

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/index.client.js",
    "./mood-tracker.jay-contract": "./dist/mood-tracker.jay-contract"
  }
}
```

**Consumer Usage:**

**Page Component (page.ts) - Server Import:**

```typescript
import { moodTracker } from 'mood-tracker-plugin';
// → Resolves to: dist/index.js (full build with all code)

export const page = makeJayStackComponent<PageContract>().withSlowlyRender(async () => {
  // Server can access full moodTracker definition
  return partialRender({ moodTracker }, {});
});
```

**Load Page Parts - Client Import:**

```typescript
// In load-page-parts.ts, when generating client imports:
clientImport: `import { moodTracker } from 'mood-tracker-plugin/client'`;
// → Resolves to: dist/index.client.js (client-only build)
```

**Result:**

- ✅ Server bundle: Includes full `index.js` (normal size)
- ✅ Client bundle: Includes only `index.client.js` (smaller, no server code)

### Example 2: Page Component Using Jay Stack Package

**Page Component (page.ts):**

```typescript
import { moodTracker } from 'mood-tracker-plugin'; // Full build
import { makeJayStackComponent } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withSlowlyRender(async () => {
    return partialRender({}, {});
  });
```

**Generated Client Script:**

```html
<script type="module">
  import { makeCompositeJayComponent } from '@jay-framework/stack-client-runtime';
  import { render } from './page.jay-html';
  import { moodTracker } from 'mood-tracker-plugin/client'; // ✅ Client build

  const pageComp = makeCompositeJayComponent(render, viewState, fastCarryForward, [
    { comp: moodTracker.comp, contextMarkers: [] },
  ]);
</script>
```

**Bundle Analysis:**

```
Client Bundle (without code splitting):
├── page.js: 45 KB
├── mood-tracker-plugin (index.js): 15 KB
    ├── Server code: 8 KB ❌ (unnecessary)
    └── Client code: 7 KB
└── Total: 60 KB

Client Bundle (with code splitting):
├── page.js: 45 KB
├── mood-tracker-plugin/client (index.client.js): 7 KB ✅
└── Total: 52 KB (13% reduction)
```

### Example 3: Local Page Component

**Input (page.ts):**

```typescript
import { DATABASE_SERVICE } from '../../services/database';
import { loadCategoryParams } from './load-params';
import { renderSlowly } from './render-slowly';
import { renderFast } from './render-fast';
import { CategoryPageInteractive } from './interactive';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { PageProps } from '@jay-framework/fullstack-component';
import type { CategoryPageContract } from './page.jay-html';

export const page = makeJayStackComponent<CategoryPageContract>()
  .withProps<PageProps>()
  .withServices(DATABASE_SERVICE)
  .withLoadParams(loadCategoryParams)
  .withSlowlyRender(renderSlowly)
  .withFastRender(renderFast)
  .withInteractive(CategoryPageInteractive);
```

**Client Bundle Output:**

```typescript
import { CategoryPageInteractive } from './interactive';
import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { PageProps } from '@jay-framework/fullstack-component';
import type { CategoryPageContract } from './page.jay-html';

export const page = makeJayStackComponent<CategoryPageContract>()
  .withProps<PageProps>()
  .withInteractive(CategoryPageInteractive);
```

**Server Bundle Output:**

```typescript
// Unchanged - original code is used
```

### Example 2: Component with Contexts

**Input:**

```typescript
import { DATABASE_SERVICE } from './database';
import { ThemeContext, UserContext } from './contexts';
import { InteractiveComponent } from './interactive';

export const page = makeJayStackComponent<Contract>()
  .withServices(DATABASE_SERVICE)
  .withContexts(ThemeContext, UserContext)
  .withSlowlyRender(async (props, db) => {
    const data = await db.query();
    return partialRender({ data }, {});
  })
  .withInteractive(InteractiveComponent);
```

**Client Output:**

```typescript
import { ThemeContext, UserContext } from './contexts';
import { InteractiveComponent } from './interactive';

export const page = makeJayStackComponent<Contract>()
  .withContexts(ThemeContext, UserContext)
  .withInteractive(InteractiveComponent);
```

Note: `.withContexts()` is preserved because client needs context markers.

### Example 5: Component with Server Data

**Input:**

```typescript
import { WIX_STORES_SERVICE } from '@wix/stores';
import { ProductListInteractive } from './interactive';

export const productList = makeJayStackComponent<ProductListContract>()
  .withServices(WIX_STORES_SERVICE)
  .withSlowlyRender(async (props, stores) => {
    const products = await stores.getProducts();
    return partialRender({ products }, {});
  })
  .withInteractive(ProductListInteractive);
```

**Client Output:**

```typescript
import { ProductListInteractive } from './interactive';

export const productList =
  makeJayStackComponent<ProductListContract>().withInteractive(ProductListInteractive);
```

## Integration with Existing Compiler Infrastructure

This solution leverages several existing utilities from the Jay compiler:

### 1. SourceFileBindingResolver

**Location**: `packages/compiler/compiler/lib/components-files/basic-analyzers/source-file-binding-resolver.ts`

**Purpose**: Creates a mapping of names to their origins. For each identifier, it can determine:

- Where was it imported from?
- What module does it come from?
- What statement defines it?

**How We Use It**: Track which identifiers are used by removed builder methods to determine which imports can be safely removed.

**Example**:

```typescript
const bindingResolver = new SourceFileBindingResolver(sourceFile);
const variable = bindingResolver.explain(identifierNode);
// Returns: { name: 'DATABASE', module: './database', definingStatement: ... }
```

### 2. SourceFileStatementDependencies

**Location**: `packages/compiler/compiler/lib/components-files/basic-analyzers/source-file-statement-dependencies.ts`

**Purpose**: Creates a dependency graph of statements. For each statement, it tracks:

- What other statements does it depend on?
- What statements depend on it?

**How We Use It**: Safely remove import statements when all their usages have been removed by method stripping.

**Example**:

```typescript
const statementDeps = new SourceFileStatementDependencies(sourceFile, bindingResolver);
const deps = statementDeps.getDependsOn(importStatement);
// Returns: Set of statements that use identifiers from this import
```

### 3. Existing Transformation Patterns

**Location**:

- `packages/compiler/compiler/lib/components-files/transform-component-bridge.ts`
- `packages/compiler/compiler/lib/components-files/transform-component.ts`

**Purpose**: Transform Jay components for security (worker/main sandbox separation).

**What We Learn**:

- How to use `mkTransformer` pattern
- How to build replace maps for AST transformation
- How to handle function repository generation
- How to filter and transform imports

**Pattern We Follow**:

```typescript
// Similar to transform-component.ts pattern
function mkCodeSplitTransformer(context, bindingResolver, statementDeps, environment) {
  // 1. Analyze source file with binding resolver
  // 2. Build replace map of nodes to remove
  // 3. Use visitor pattern to transform AST
  // 4. Remove unused statements using dependencies
}
```

### Why This Approach?

1. **Proven Patterns**: Reuses battle-tested code from security transformations
2. **Consistent**: Follows established Jay compiler patterns
3. **Reliable**: SourceFileBindingResolver and SourceFileStatementDependencies handle edge cases
4. **Maintainable**: Future compiler improvements benefit this plugin automatically

### Differences from Security Transformations

| Aspect         | Security Transform            | Code Split Transform         |
| -------------- | ----------------------------- | ---------------------------- |
| **Target**     | Event handlers, exec$ calls   | Builder method chains        |
| **Purpose**    | Separate trusted/sandbox code | Separate client/server code  |
| **Output**     | Multiple files (main/worker)  | Same file, different content |
| **Complexity** | High (function repo, bridges) | Medium (method stripping)    |

## Trade-offs and Considerations

### ✅ Advantages

1. **Better Developer Experience**: Write all component logic in one place
2. **Type Safety**: Full TypeScript support across entire component definition
3. **Security**: Server code physically cannot leak to client
4. **Performance**: Smaller client bundles
5. **Automatic**: Works without manual code organization
6. **Backward Compatible**: No changes to existing component APIs

### ⚠️ Potential Challenges

1. **Build Complexity**: Additional build step and plugin
2. **Debugging**: Source maps need to be generated correctly
3. **Edge Cases**: Complex JS patterns might confuse AST parser
4. **Learning Curve**: Developers need to understand what code goes where

### 🤔 Questions & Unknowns

**Q: What about dynamic imports or require()?**
A: Initial implementation handles static ES6 imports. Dynamic imports need separate handling in Phase 2.

**Q: How do we handle type-only imports?**
A: ✅ **Answered by existing code**: `SourceFileBindingResolver` distinguishes type imports. Type-only imports should be preserved as they don't affect runtime bundles.

**Q: What if a method is called conditionally?**

```typescript
const builder = makeJayStackComponent().withProps<Props>();

if (hasServerData) {
  builder.withSlowlyRender(render);
}
```

A: Initial implementation only handles method chaining. Conditional composition is out of scope for Phase 1. The existing `transform-component.ts` also only handles direct patterns.

**Q: Should we support a manual annotation system as an escape hatch?**

```typescript
/* @jay-server-only */
import { DATABASE } from './db';
```

A: Not in Phase 1. Can be added if needed based on feedback. However, the existing security transformations don't use annotations, they rely on pattern matching, which works well.

**Q: How do we handle comments in transformed code?**
A: ✅ **Answered**: TypeScript `createPrinter()` preserves comments by default (see `transform-component-bridge.ts`). No special handling needed.

**Q: What about inline arrow functions?**

```typescript
.withSlowlyRender(async (props) => {
    // Large inline function
})
```

A: These will be stripped correctly - the entire method call is removed. The `trackRemovedIdentifiers` function will analyze the arrow function's body to find any imports it references.

**Q: Performance impact on build time?**
A: AST transformation adds overhead. However, the existing `jay:runtime` plugin already does similar transformations, so incremental impact should be minimal. Need to measure and potentially cache results.

**Q: Should we use TypeScript directly or through typescript-bridge?**
A: ✅ **Answered**: Use `@jay-framework/typescript-bridge` like all other compiler code. This provides version consistency and simplifies imports:

```typescript
import tsBridge from '@jay-framework/typescript-bridge';
const { isCallExpression, isPropertyAccessExpression, createPrinter } = tsBridge;
```

**Q: Do we need to handle both .ts and .js files?**
A: Jay Stack components are always TypeScript (`.ts` files with `.withProps<Type>()`). No need to handle plain JavaScript.

**Q: How do Jay Stack packages export dual builds?**
A: Two approaches:

1. **Export conditions**: Use package.json `"exports"` with custom `"jay-client"` condition
2. **Separate exports**: Export `"."` (full) and `"./client"` (client-only)

Initial implementation uses approach #2 (separate exports) as it's more widely supported.

**Q: What about packages with multiple components?**
A: Each entry point needs dual builds:

```json
{
  "exports": {
    "./mood-tracker": "./dist/mood-tracker.js",
    "./mood-tracker/client": "./dist/mood-tracker.client.js",
    "./weather-widget": "./dist/weather-widget.js",
    "./weather-widget/client": "./dist/weather-widget.client.js"
  }
}
```

**Q: Do we need a server-only build too?**
A: ✅ **YES!** This is critical to prevent runtime crashes. If `withInteractive` uses browser APIs like `document` or `window`, the server will crash when it tries to import that code. The server build MUST strip client code.

**Example of the problem:**

```typescript
// mood-tracker.ts
export const moodTracker = makeJayStackComponent<MoodTrackerContract>()
    .withInteractive((props, refs) => {
        // This crashes on Node.js!
        const root = document.getElementById('root');
        window.addEventListener('resize', ...);
        return { render: () => ({}) };
    });

// page.ts (runs on server)
import { moodTracker } from './mood-tracker';  // ❌ CRASH!
```

**With server build:**

```typescript
// dist/index.js (server build)
export const moodTracker = makeJayStackComponent<MoodTrackerContract>();
// withInteractive removed - no browser APIs ✅
```

## Migration Path

### Immediate (Phase 1)

No migration needed! This is a **build-time enhancement**:

- Existing components work as-is
- No API changes
- No breaking changes

### Future Enhancements (Beyond Phase 1)

**Phase 2: Server-Side Stripping**

- Also strip client code from server bundles
- Smaller server bundle, faster cold starts

**Phase 3: Build-Time Validation**

- Lint rule: Server imports only in server methods
- TypeScript plugin: Warn if server type used in client method

**Phase 4: Bundle Analysis**

- CLI command to show what code goes where
- Visualization of client vs server code split

## Success Criteria

### Must Have (Phase 1)

- [ ] Client bundles do NOT contain server method implementations
- [ ] Client bundles do NOT contain server-only imports
- [ ] Server bundles still contain full component definition
- [ ] All existing tests pass
- [ ] Type safety is preserved
- [ ] Source maps work correctly for debugging
- [ ] Dev server supports hot reload with code splitting

### Should Have

- [ ] Build time increase < 10%
- [ ] Documentation includes examples
- [ ] Integration tests cover common patterns
- [ ] Error messages are helpful when transformation fails

### Nice to Have

- [ ] Bundle size analysis tool
- [ ] Visual indicator in dev tools showing split points
- [ ] Support for dynamic imports

## Implementation Checklist

### Phase 1: Core Plugin

- [ ] Create plugin package structure (`packages/jay-stack/jay-stack-compiler/`)
- [ ] Set up package.json with dependencies on:
  - `@jay-framework/compiler` (for utilities)
  - `@jay-framework/typescript-bridge` (for AST operations)
  - `@jay-framework/vite-plugin` (for composing jay:runtime)
- [ ] Implement `transform-jay-stack-builder.ts` using `SourceFileBindingResolver` and `SourceFileStatementDependencies`
- [ ] Implement `find-builder-methods.ts` to locate builder method chains
- [ ] Create main plugin export in `index.ts` that returns array of plugins
- [ ] Add unit tests for transformation logic
- [ ] Generate source maps for debugging
- [ ] Configure build with vite.config.ts and tsconfig.json

### Phase 2: Integration

- [ ] Update `load-page-parts.ts` to use `?jay-client` query params for local files (client imports)
- [ ] Update `load-page-parts.ts` to use `/client` export for npm packages (client imports)
- [ ] Update server-side page loading to use `?jay-server` query params (server imports) ✅ NEW
- [ ] Update npm package server imports to use default export (already server build) ✅ NEW
- [ ] Replace `jayRuntime()` with `...jayStackCompiler()` in dev-server
- [ ] Replace `jayRuntime()` with `...jayStackCompiler()` in stack-cli
- [ ] Update package.json dependencies in dev-server and stack-cli (replace vite-plugin with jay-stack-compiler)
- [ ] Test with dev server hot reload
- [ ] Verify plugin composition works correctly (both transformations run)
- [ ] Verify server doesn't crash when importing files with browser APIs ✅ NEW
- [ ] Update mood-tracker-plugin to use triple build pattern (server, client, optional full) ✅ NEW
- [ ] Test importing mood-tracker-plugin from a page (verify both bundles are optimized) ✅ NEW

### Phase 3: Validation

- [ ] Create integration test suite that builds actual components
- [ ] Verify client bundles don't include server code (grep for `withServices`, `withLoadParams`, etc.)
- [ ] Verify server bundles don't include client code (grep for `withInteractive`, `withContexts`)
- [ ] Test with all jay-stack examples (fake-shop, etc.)
- [ ] Verify type safety is maintained
- [ ] Performance benchmarking (build time impact)
- [ ] Test error messages when transformation fails

### Phase 4: Documentation

- [ ] Create plugin README with usage examples
- [ ] Update fullstack-component README with code splitting section
- [ ] Add JSDoc comments to transformation functions
- [ ] Update this design log with implementation results and lessons learned
- [ ] Document any deviations from the design

### Phase 5: Testing with Real Examples

- [ ] Test with `examples/jay-stack/fake-shop`
- [ ] Test with `examples/jay-stack/mood-tracker-plugin` (as a package)
- [ ] Test importing mood-tracker-plugin into a page
- [ ] Test with wix-stores integration (if it uses Jay Stack components)
- [ ] Verify bundle sizes before/after (especially client bundles)
- [ ] Verify dev server performance
- [ ] Test hot reload functionality with dual builds

### Phase 6: Jay Stack Package Guidelines

- [ ] Create documentation for building Jay Stack packages
- [ ] Add template vite.config.ts for dual builds
- [ ] Document package.json exports pattern
- [ ] Add example showing how to test dual builds locally
- [ ] Create script/tooling to help scaffold Jay Stack packages

## Open Questions for Review

1. ~~Should we extend `jay:runtime` plugin or create a new standalone plugin?~~

   - **Decision**: Create `@jay-framework/jay-stack-compiler` that composes `jay:runtime` internally
   - **Rationale**:
     - Separation of concerns at code level
     - Simpler API for developers (one plugin instead of two)
     - Automatic correct plugin ordering
     - Jay-stack specific logic isolated in its own package

2. Should we also strip client code from server bundles?

   - **Current design**: Yes, using `?jay-server` query param
   - **Benefit**: Smaller server bundles, faster cold starts
   - **Risk**: Need to ensure server still has access to type information

3. Do we need a way to explicitly mark methods as server/client for edge cases?

   - **Current design**: No annotations, rely on method name patterns (like existing security transforms)
   - **Future**: Could add `/* @jay-client-only */` comments if needed

4. What's the error handling strategy when AST transformation fails?

   - **Proposed**: Fail build with helpful error message pointing to problematic code
   - **Fallback**: Option to disable transformation and emit warning?

5. Should we support non-method-chain patterns (e.g., builder stored in variable)?

   - **Phase 1**: No, only direct method chaining
   - **Rationale**: Matches existing patterns, simplifies implementation
   - **Future**: Can be added if real-world usage demands it

6. Should the transformation be conditional on project configuration?
   - **Proposed**: Always enabled when plugin is installed
   - **Alternative**: Add `jayStackConfig` option to disable for debugging

## Using TypeScript Bridge

All TypeScript AST operations should use `@jay-framework/typescript-bridge` for consistency:

```typescript
import tsBridge from '@jay-framework/typescript-bridge';

const {
  isCallExpression,
  isPropertyAccessExpression,
  isIdentifier,
  isImportDeclaration,
  visitEachChild,
  createPrinter,
  createSourceFile,
  transform,
  ScriptTarget,
} = tsBridge;
```

**Benefits**:

- Version consistency across all compiler packages
- Centralized TypeScript dependency management
- Easier to upgrade TypeScript version in one place

**Pattern from existing code**: All transform files use this approach (see `transform-component.ts`, `transform-component-bridge.ts`).

## References

### Design Logs

- Design Log #34: Jay Stack architecture and rendering phases
- Design Log #50: Rendering phases in contracts with phase annotations

### Jay Stack Implementation

- `packages/jay-stack/full-stack-component/lib/jay-stack-builder.ts`: Current builder implementation
- `packages/jay-stack/stack-server-runtime/lib/generate-client-script.ts`: Client script generation
- `packages/jay-stack/stack-server-runtime/lib/load-page-parts.ts`: Page part loading

### Compiler Utilities (Reused)

- `packages/compiler/compiler/lib/components-files/basic-analyzers/source-file-binding-resolver.ts`: Identifier → origin mapping
- `packages/compiler/compiler/lib/components-files/basic-analyzers/source-file-statement-dependencies.ts`: Statement dependency tracking
- `packages/compiler/compiler/lib/components-files/transform-component-bridge.ts`: Security transformation example
- `packages/compiler/compiler/lib/components-files/transform-component.ts`: Component transformation patterns

### TypeScript Bridge

- `typescript-bridge/`: TypeScript API abstraction layer

---

## Summary

This design proposes a **build-time code splitting solution** for Jay Stack components using a composite Vite plugin that leverages existing compiler utilities.

### Key Decisions

1. **Composite Plugin Architecture**: Create `@jay-framework/jay-stack-compiler` that internally composes the `jay:runtime` plugin
   - Developers use one plugin: `...jayStackCompiler()`
   - Replaces standalone `jayRuntime()` in Jay Stack projects
   - Handles both Jay runtime compilation AND code splitting
2. **Reuse Existing Utilities**: Leverage `SourceFileBindingResolver` and `SourceFileStatementDependencies` from `@jay-framework/compiler`

3. **Bidirectional Transformation** (CRITICAL):

   - **Client builds** (`?jay-client`): Strip server methods → Prevents server code in browser
   - **Server builds** (`?jay-server`): Strip client methods → Prevents browser APIs on Node.js
   - Both transformations use the same AST utilities

4. **Dual Import Strategy**:

   - **Local files** (pages): Use `?jay-client` / `?jay-server` query parameters
   - **npm packages** (plugins): Use export paths (`"."` for server, `"/client"` for client)

5. **AST Transformation**: Strip unwanted builder methods and remove unused imports

6. **Method Classification**:

   - **Server-only**: `withServices`, `withLoadParams`, `withSlowlyRender`, `withFastRender`
   - **Client-only**: `withInteractive`, `withContexts`
   - **Shared**: `withProps`

7. **Jay Stack Package Pattern**: Reusable components export optimized builds
   - `"."` → `dist/index.js` (server build - client code stripped)
   - `"./client"` → `dist/index.client.js` (client build - server code stripped)
   - Built using same plugin with `?jay-server` and `?jay-client` entry points

### Benefits

- ✅ **Prevents Runtime Crashes**: Server doesn't execute browser APIs (CRITICAL!)
- ✅ **Security**: Server code physically cannot leak to client
- ✅ **Performance**: Smaller bundles on BOTH client and server
- ✅ **DX**: Developers write components in one place
- ✅ **Type Safety**: Full TypeScript support maintained
- ✅ **Reliability**: Reuses proven compiler infrastructure
- ✅ **Maintainability**: Follows existing Jay patterns
- ✅ **Simple API**: One plugin replaces `jayRuntime()` - no need to configure multiple plugins
- ✅ **Correct ordering**: Code splitting automatically runs before jay:runtime compilation
- ✅ **Bidirectional**: Strips server code from client AND client code from server

### Risks & Mitigations

| Risk                                        | Mitigation                                              |
| ------------------------------------------- | ------------------------------------------------------- |
| Runtime crashes from browser APIs on server | Strip client code from server builds (`?jay-server`) ✅ |
| Build time increase                         | Reuse existing AST analysis, cache when possible        |
| Complex edge cases                          | Start with method chaining only, expand later           |
| Plugin conflicts                            | Enforce plugin ordering, test integration               |
| Debug difficulty                            | Generate source maps, provide helpful errors            |
| Breaking existing packages                  | Provide migration guide and backwards compatibility     |

---

**Status**: Design Complete - Ready for Review & Implementation

**Next Steps**:

1. ✅ Review design log
2. Get approval on approach (leveraging existing utilities)
3. Begin Phase 1 implementation
4. Update this document with implementation results and lessons learned

**Migration Path for Existing Projects**:

```typescript
// Before (using jay:runtime directly)
import { jayRuntime } from '@jay-framework/vite-plugin';
plugins: [jayRuntime(config)];

// After (using jay-stack-compiler)
import { jayStackCompiler } from '@jay-framework/jay-stack-compiler';
plugins: [...jayStackCompiler(config)];
```

**Estimated Effort**:

- Phase 1 (Core Plugin + Composition): 2-3 days
- Phase 2 (Integration): 1 day
- Phase 3 (Validation): 1-2 days
- Phase 4 (Documentation): 1 day
- **Total**: ~5-7 days

**Note**: The composite plugin architecture simplifies integration, potentially reducing Phase 2 effort.

---

## Jay Stack Package Triple Build Pattern

### Summary

Jay Stack packages (reusable components like `mood-tracker-plugin`) need to export **three builds** (or two optimized builds):

| Build      | Entry                     | Output                 | Export Path           | Used By        | Contains            |
| ---------- | ------------------------- | ---------------------- | --------------------- | -------------- | ------------------- |
| **Server** | `lib/index.ts?jay-server` | `dist/index.js`        | `"."` (default)       | Server imports | Server code only ✅ |
| **Client** | `lib/index.ts?jay-client` | `dist/index.client.js` | `"./client"`          | Client imports | Client code only ✅ |
| **Full**   | `lib/index.ts`            | `dist/index.full.js`   | `"./full"` (optional) | Legacy/debug   | All code ⚠️         |

**Recommended:** Only build Server + Client (skip Full build)

### Vite Configuration

```typescript
// vite.config.ts for Jay Stack packages
import { jayStackCompiler } from '@jay-framework/jay-stack-compiler';

export default defineConfig({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'lib/index.ts?jay-server'), // Server build ✅
        'index.client': resolve(__dirname, 'lib/index.ts?jay-client'), // Client build ✅
      },
      formats: ['es'],
    },
  },
});
```

### Package.json Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/index.client.js"
  }
}
```

### Consumer Usage

**Server (page.ts):**

```typescript
import { component } from 'my-plugin';
// → dist/index.js (server build - no browser APIs) ✅
```

**Client (generated):**

```typescript
import { component } from 'my-plugin/client';
// → dist/index.client.js (client build - no server code) ✅
```

### Benefits

- ✅ **Server doesn't crash** on browser APIs (critical!)
- ✅ **Client bundles** are smaller (no server code)
- ✅ **Server bundles** are smaller (no client code)
- ✅ Consumers automatically get optimized builds
- ✅ No configuration needed by consumers
- ✅ Package authors use same plugin for both builds
- ✅ Standard npm package patterns (export maps)

---

## Implementation Results

### Learnings

#### Test Structure Insights

Following the pattern from `compiler-jay-html`:

- Use **fixtures** with `source.ts`, `expected-client.ts`, `expected-server.ts`
- Use `prettify()` from `@jay-framework/compiler-shared` for comparing output
- Create test utilities (`test-utils/file-utils.ts`) for reading fixtures
- Avoid `.not.toContain()` - use exact comparison with prettified expected output

Test coverage includes:

- Basic page with all builder methods
- Pages with contexts
- Inline arrow functions in builder methods
- Regular functions in same file (preserved when used elsewhere)

#### Plugin Composition Pattern

Successfully implemented composite plugin pattern:

```typescript
export function jayStackCompiler(jayOptions: JayRollupConfig = {}): Plugin[] {
  return [
    {
      name: 'jay-stack:code-split',
      enforce: 'pre', // Runs before jay:runtime
      transform(code, id) {
        /* ... */
      },
    },
    jayRuntime(jayOptions), // Existing plugin
  ];
}
```

Benefits:

- Single import for developers
- Automatic correct ordering
- Backward compatible (same config options)

### Next Steps

1. **Resolve TypeScript Compatibility**:

   - Export utilities from `@jay-framework/compiler` main index
   - Or align TypeScript versions across all packages

2. **Build and Test**:

   ```bash
   cd packages/jay-stack/jay-stack-compiler
   yarn build
   yarn test
   ```

3. **Validate with Examples**:

   - Build mood-tracker-plugin with dual outputs
   - Run dev-server with fake-shop example
   - Verify bundle sizes reduced

4. **Update Additional Packages**:
   - `@jay-framework/wix-stores` - dual builds
   - `stack-cli` - use `jayStackCompiler()`

### Open Questions Discovered During Implementation

1. **How to handle dynamic composition?**

   ```typescript
   let builder = makeJayStackComponent();
   if (condition) builder.withSlowlyRender(fn);
   ```

   Current implementation only handles method chaining.

2. **Should we cache transformation results?**
   AST transformation adds build overhead - caching might help.

3. **What about source maps?**
   Currently returning `{ code, map: undefined }` - need to generate proper source maps for debugging.

---

**Implementation Progress**: ~80% complete  
**Blocking Issue**: TypeScript version compatibility  
**Estimated Time to Complete**: 1-2 hours (once TS compatibility resolved)

### New Findings from Implementation

#### Transform Pattern Requirements

The transformation needs to follow the `mkTransformer` pattern used by existing Jay compiler code:

```typescript
// Use mkTransformer utility from @jay-framework/compiler
const transformers = [mkTransformer(mkJayStackCodeSplitTransformer, { environment })];
```

Key differences from initial approach:

- Use `mkTransformer` instead of raw `transform()` call
- Follow `SourceFileTransformerContext` pattern with `{ factory, sourceFile, context }`
- Use **replace map pattern** for expression transformations
- Use `factory.updateSourceFile()` for statement-level changes

#### Import Removal Strategy

Instead of using `SourceFileStatementDependencies` for removal decisions, simpler to:

1. Collect all identifiers still used after transformation
2. Filter import statements based on usage
3. Rebuild source file with `factory.updateSourceFile(sourceFile, filteredStatements)`

This is more reliable and matches the pattern in `transform-component-bridge.ts`.

#### Test Fixture Pattern Requirements

Tests must follow the pattern from `compiler-jay-html`:

- Fixtures in `test/fixtures/` with subdirectories per scenario
- Each fixture has: `source.ts`, `expected-client.ts`, `expected-server.ts`
- Use `prettify()` for exact comparison
- Test utilities in `test/test-utils/file-utils.ts`
- No `.not.toContain()` - use exact string matching with prettified output

Required test coverage:

- Basic page with all builder methods
- Pages with contexts
- Inline arrow functions (in `.withSlowlyRender(async () => {})`)
- Regular functions in same file (must be preserved if used elsewhere)

### Implementation Results - Key Bug Fix

**Critical Bug**: Import statements were being completely removed instead of filtered.

**Root Cause**: When tracking removed variables (from deleted method calls), the `definingStatement` of those variables pointed to their import declarations. This caused entire import statements to be added to `statementsToRemove`, bypassing the import filtering logic.

**Solution**: Modified `analyzeUnusedStatements` to skip import declarations when building `statementsToRemove`:

```typescript
// Never remove import declarations via statementsToRemove
// They're handled separately via the unusedImports mechanism
if (isImportDeclaration(variable.definingStatement)) {
  continue;
}
```

This ensures imports are only processed through the proper filtering mechanism that removes individual unused imports while preserving used ones.

**Test Results**: ✅ All 8 tests passing with proper separation of concerns in building blocks.

### Implementation Changes from Design

**Key Deviations**:

1. **Package Location**: Moved from `packages/jay-stack/jay-stack-compiler/` to `packages/compiler/compiler-jay-stack/` to align with other compiler packages.

2. **Unused Code Removal Approach**: Initial design proposed using `SourceFileStatementDependencies` to track and remove unused statements. Implementation uses a simpler iterative approach:
   - Transform AST to remove builder methods
   - Create fresh `SourceFileBindingResolver` on transformed file
   - Iteratively collect used identifiers and remove unused statements
   - This proved more reliable than tracking dependencies across original and transformed ASTs

3. **Dependency Detection Algorithm**: The unused code removal algorithm is based on **identifier name matching** rather than using `Variable` objects from `BindingResolver`. This is less resilient and may incorrectly remove/keep code in edge cases with shadowed variables or complex scoping. Needs more real-world testing and may require refinement to use proper variable tracking.

4. **Builder Method Detection**: Used `FlattenedAccessChain` comparison to reliably identify builder method calls across AST transformations. Added `areFlattenedAccessChainsEqual` utility to `@jay-framework/compiler` for robust comparison including `root` property.

5. **Test Fixture Approach**: Followed `compiler-jay-html` pattern with fixture files and `prettify()` for exact comparison, rather than the `.not.toContain()` approach initially sketched in the design.

**What Worked Well**:
- Building block pattern (separate analysis and transformation functions)
- Composite plugin pattern (`jayStackCompiler` returning array of plugins)
- Dual build support for packages using query parameters (`?jay-client`, `?jay-server`)
- Recursive removal of unused helper functions, types, and interfaces
