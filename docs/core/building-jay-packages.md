# Building Jay Packages (Plugins)

Jay packages (also called plugins) are NPM packages that provide reusable full-stack components with contracts, making them available to other Jay Stack applications.

## Overview

A Jay package provides:

- **Full-Stack Components** - Server-side rendering and client-side interactivity
- **Contracts** - Type-safe interfaces defined in `.jay-contract` files
- **Plugin Manifest** - `plugin.yaml` declaring exposed components
- **Dual Builds** - Separate client and server bundles for optimal performance
- **NPM Distribution** - Published to NPM or used as local dependencies

## Package Structure

A complete Jay package has the following structure:

```
my-plugin/
├── package.json              # NPM package with exports configuration
├── plugin.yaml               # Plugin manifest (MUST be exported)
├── vite.config.ts            # Build configuration for dual builds
├── lib/                      # Source files
│   ├── index.ts              # Main entry - exports all components
│   ├── my-component.ts       # Component implementation
│   └── my-component.jay-contract  # Component contract
└── dist/                     # Built output (generated)
    ├── index.js              # Server build
    ├── index.client.js       # Client build
    ├── index.d.ts            # TypeScript declarations
    └── my-component.jay-contract  # Copied contract files
        └── my-component.jay-contract.d.ts
```

## Step-by-Step Guide

### 1. Initialize the Package

Create a new NPM package:

```bash
mkdir my-plugin
cd my-plugin
npm init -y
```

Configure `package.json` for ESM and add required fields:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "plugin.yaml"],
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/index.client.js",
    "./my-component.jay-contract": "./dist/my-component.jay-contract",
    "./plugin.yaml": "./plugin.yaml"
  }
}
```

**Key points:**

- `"type": "module"` - Use ES modules
- `"files"` - Include `plugin.yaml` and `dist/` in NPM package
- `"exports["."]"` - Server build (default export)
- `"exports["./client"]"` - Client build for browser
- `"exports["./plugin.yaml"]"` - **Required** for plugin resolution
- `"exports["./*.jay-contract"]"` - Export contract files

### 2. Install Dependencies

Install Jay framework packages:

```bash
npm install \
  @jay-framework/component \
  @jay-framework/fullstack-component \
  @jay-framework/reactive \
  @jay-framework/runtime \
  @jay-framework/secure

npm install --save-dev \
  @jay-framework/jay-cli \
  @jay-framework/compiler-jay-stack \
  typescript \
  vite \
  rimraf
```

### 3. Create the Contract

Define your component's interface in a `.jay-contract` file:

**`lib/mood-tracker.jay-contract`:**

```yaml
name: MoodTracker
tags:
  - tag: mood
    type: data
    dataType: enum (happy | neutral | sad)
    phase: fast+interactive
    description: Current mood selection

  - tag: happyButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to select happy mood

  - tag: neutralButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to select neutral mood

  - tag: sadButton
    type: interactive
    elementType: HTMLButtonElement
    description: Button to select sad mood
```

See [Contract Files](./contract-files.md) for full contract documentation.

### 4. Implement the Component

Create the full-stack component implementation:

**`lib/mood-tracker.ts`:**

```typescript
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { MoodTrackerContract } from './mood-tracker.jay-contract';

export const moodTracker = makeJayStackComponent<MoodTrackerContract>()
  .withProps<{}>()

  // Fast render: Initialize mood from server or default
  .withFastRender(async () => {
    return phaseOutput({ mood: 'neutral' }, {});
  })

  // Interactive: Handle client-side mood changes
  .withInteractive((props, refs, viewStateSignals, fastCarryForward) => {
    // Parameter order:
    // 1. props - from withProps() + URL params
    // 2. refs - interactive elements from contract
    // 3. viewStateSignals - Signals<FastViewState> (reactive access to fast-phase data)
    // 4. fastCarryForward - carry forward from fast render (first context)
    // 5. ...contexts - any requested contexts via withContexts()

    // viewStateSignals provides reactive access to fast-rendered data
    const [getMood, setMood] = viewStateSignals.mood;

    refs.happyButton.onclick(() => setMood('happy'));
    refs.neutralButton.onclick(() => setMood('neutral'));
    refs.sadButton.onclick(() => setMood('sad'));

    return {
      render: () => ({
        mood: getMood(),
      }),
    };
  });
```

**Key concepts:**

- `phaseOutput(rendered, carryForward)` - Returns phase output with ViewState and carry-forward data
- `viewStateSignals` - Reactive signals for fast-phase ViewState properties (first parameter to contexts)
- See [Jay Stack Components](./jay-stack.md) for full builder API documentation

### 5. Export from Index

Export all components from the main entry point:

**`lib/index.ts`:**

```typescript
export { moodTracker } from './mood-tracker';
```

### 6. Create the Plugin Manifest

Define which components your plugin exposes:

**`plugin.yaml`:**

```yaml
name: my-plugin

# For NPM packages, 'module' is optional and defaults to package main export
# module: ./lib/index.js # Only needed if different from package.json "main"

contracts:
  - name: mood-tracker
    contract: mood-tracker.jay-contract # Export subpath from package.json
    component: moodTracker # Exported member name from index.ts
    description: A mood tracker component with happy, neutral, and sad states
    slugs: ['userId', 'moodId'] # Optional: Dynamic URL slugs expected by this contract
```

**Field descriptions:**

- `name` - Plugin identifier (usually matches package name)
- `module` - (Optional) Path to component module. Defaults to package main export (`.`)

**Contract field descriptions:**

- `name` - Contract identifier
- `contract` - Path to `.jay-contract` file (export subpath for NPM packages)
- `component` - Exported member name from the module (e.g., "moodTracker")
- `description` - (Optional) Human-readable description of the component
- `slugs` - (Optional) Array of dynamic URL slugs expected by this contract (e.g., ["userId", "productId"]). This declares what URL parameters the contract expects when used in dynamic routes like `/products/[slug]/` or `/users/[userId]/posts/[postId]/`
- `contracts[]` - Array of contracts exposed by this plugin
  - `name` - Contract identifier (used in `<script plugin="..." contract="name">`)
  - `contract` - Export subpath to the `.jay-contract` file (matches `package.json` exports)
  - `component` - The exported member name from the module (e.g., `moodTracker` from `index.ts`)
  - `description` - (Optional) Human-readable description

### 7. Configure Build

Create a Vite configuration for dual builds (client + server):

**`vite.config.ts`:**

```typescript
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { JayRollupConfig, jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const jayOptions: JayRollupConfig = {
  tsConfigFilePath: resolve(__dirname, 'tsconfig.json'),
  outputDir: 'build/jay-runtime',
};

export default defineConfig(({ command, mode }) => {
  // Check if SSR build
  const isSsrBuild = process.env.npm_lifecycle_script?.includes('--ssr');

  return {
    plugins: [...jayStackCompiler(jayOptions)],
    build: {
      minify: false,
      target: 'es2020',
      emptyOutDir: false, // Keep both builds in dist/
      lib: {
        entry: isSsrBuild
          ? { index: resolve(__dirname, 'lib/index.ts') }
          : { 'index.client': resolve(__dirname, 'lib/index.ts') },
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
  };
});
```

**Why dual builds?**

- **Server build** (`index.js`) - Client code stripped, safe for Node.js
- **Client build** (`index.client.js`) - Server code stripped, optimized for browser
- **Security** - Server secrets never leak to client
- **Performance** - Smaller, optimized bundles for each environment

See Design Log #52 for full code splitting details.

### 8. Add Build Scripts

Update `package.json` with build scripts:

```json
{
  "scripts": {
    "build": "npm run definitions && npm run build:client && npm run build:server && npm run build:copy-contract",
    "definitions": "jay-cli definitions lib",
    "build:client": "vite build",
    "build:server": "vite build --ssr",
    "build:copy-contract": "cp lib/*.jay-contract* dist/",
    "validate": "jay-stack-cli validate-plugin .",
    "clean": "rimraf dist"
  }
}
```

**Script purposes:**

- `definitions` - Generate TypeScript definitions from contracts
- `build:client` - Build client bundle (`index.client.js`)
- `build:server` - Build server bundle (`index.js`)
- `build:copy-contract` - Copy contract files to `dist/`
- `validate` - Validate plugin structure and references
- `build` - Run all build steps in order

### 9. Build the Package

Run the build:

```bash
npm run build
```

This will:

1. Generate `.d.ts` files from contracts
2. Build client bundle (`dist/index.client.js`)
3. Build server bundle (`dist/index.js`)
4. Copy contract files to `dist/`

### 10. Validate the Package

Use the validation tool to check your plugin:

```bash
npm run validate
```

or with verbose output:

```bash
jay-stack-cli validate-plugin . --verbose
```

The validator checks:

- ✅ `plugin.yaml` schema is valid
- ✅ All referenced contract files exist
- ✅ All contract files are valid YAML
- ✅ All component modules exist and export the specified members
- ✅ `package.json` exports `plugin.yaml`
- ✅ `package.json` exports all contract files
- ✅ TypeScript definitions are generated

### 11. Publish to NPM

Once validated, publish your package:

```bash
npm publish
```

Or for scoped packages:

```bash
npm publish --access public
```

## Using Your Package

### In Another Jay Stack App

Install the package:

```bash
npm install my-plugin
```

Use in a page template:

**`src/pages/index.jay-html`:**

```html
<html>
  <head>
    <script
      type="application/jay-headless"
      plugin="my-plugin"
      contract="mood-tracker"
      key="tracker"
    ></script>
  </head>
  <body>
    <h1>How are you feeling?</h1>
    <div>
      <button ref="tracker.happyButton">😊 Happy</button>
      <button ref="tracker.neutralButton">😐 Neutral</button>
      <button ref="tracker.sadButton">😢 Sad</button>
    </div>
    <p>Current mood: {tracker.mood}</p>
  </body>
</html>
```

**How it works:**

1. Jay Stack compiler resolves `plugin="my-plugin"` by:
   - Using `require.resolve('my-plugin/plugin.yaml')` to find the plugin
   - Loading `plugin.yaml` to get component paths
   - Finding the `mood-tracker` contract in the contracts array
2. Server imports `my-plugin` (resolves to `dist/index.js`)
3. Client imports `my-plugin/client` (resolves to `dist/index.client.js`)
4. Contract types from `my-plugin/mood-tracker.jay-contract` provide type safety

## Local Plugins

For plugins not published to NPM, use the `src/plugins/` directory:

```
my-app/
└── src/
    ├── pages/
    │   └── index.jay-html
    └── plugins/
        └── my-local-plugin/
            ├── plugin.yaml
            ├── my-component.jay-contract
            └── my-component.ts
```

**Local `plugin.yaml` differences:**

```yaml
name: my-local-plugin
module: ./my-component # Relative to plugin.yaml

contracts:
  - name: my-component
    contract: ./my-component.jay-contract # Relative to plugin.yaml
    component: myComponent
```

**Key differences from NPM packages:**

- Paths are **relative** to `plugin.yaml` (use `./` or `../`)
- No need for `package.json` exports
- `module` field is **required** (no default)
- Not built separately - compiled with the app

**Usage in templates (same syntax):**

```html
<script
  type="application/jay-headless"
  plugin="my-local-plugin"
  contract="my-component"
  key="comp"
></script>
```

## Advanced Topics

### Services in Plugins

Plugins can use services for server-side logic:

```typescript
import { createJayService } from '@jay-framework/fullstack-component';

// Define service marker
export interface WeatherService {
  getCurrentWeather(location: string): Promise<WeatherData>;
}

export const WEATHER_SERVICE = createJayService<WeatherService>('Weather');

// Use in component
export const weatherWidget = makeJayStackComponent<WeatherContract>()
  .withProps<{ location: string }>()
  .withServices(WEATHER_SERVICE)
  .withSlowlyRender(async (props, weatherService) => {
    const weather = await weatherService.getCurrentWeather(props.location);
    return phaseOutput({ temperature: weather.temp }, { weatherId: weather.id });
  })
  .withFastRender(async (props, slowCarryForward, weatherService) => {
    // slowCarryForward is injected as the FIRST SERVICE (before requested services)
    const forecast = await weatherService.getForecast(slowCarryForward.weatherId);
    return phaseOutput({ forecast: forecast.summary }, {});
  });
```

**Important:** Consumers of your plugin must register the service in their `src/jay.init.ts`:

```typescript
import { registerService } from '@jay-framework/stack-server-runtime';
import { WEATHER_SERVICE, createWeatherService } from 'my-weather-plugin';

registerService(WEATHER_SERVICE, createWeatherService());
```

See [Jay Stack Components - Service Management](./jay-stack.md#service-management) for details.

### Dynamic Contracts

Plugins can generate contracts at build time (e.g., from a CMS schema):

```typescript
import { makeContractGenerator, createJayService } from '@jay-framework/fullstack-component';

// Define a service for the generator
interface CMSClient {
  getCollections(): Promise<Array<{ name: string; fields: Field[] }>>;
}

const CMS_CLIENT = createJayService<CMSClient>('CMSClient');

// Create contract generator
export const cmsContracts = makeContractGenerator()
  .withServices(CMS_CLIENT)
  .generateWith(async (cmsClient) => {
    const collections = await cmsClient.getCollections();

    return collections.map((collection) => ({
      name: `cms-${collection.name}`,
      yaml: `
name: ${collection.name}
tags:
${collection.fields.map((f) => `  - tag: ${f.name}\n    type: data\n    dataType: ${f.type}`).join('\n')}
      `.trim(),
      description: `CMS collection: ${collection.name}`,
    }));
  });
```

**`plugin.yaml` for dynamic contracts:**

```yaml
name: cms-plugin

dynamic_contracts:
  - prefix: cms-
    generator: ./cms-contracts-generator
    component: cmsCollection
    description: Dynamically generated contracts from CMS schema
```

See Design Log #60 for full dynamic contract implementation.

## URL Parameter Declarations

When your component expects dynamic URL parameters (slugs), declare them in the `slugs` field:

```yaml
contracts:
  - name: product-detail
    contract: product-detail.jay-contract
    component: productDetail
    description: Product detail page component
    slugs: ['category', 'productId'] # Expects for example /products/[category]/[productId]/
```

**How slugs work:**

1. **Declaration** - The `slugs` array declares what URL parameters your contract expects
2. **Route matching** - Jay Stack matches these to dynamic route segments like `[category]` and `[productId]`
3. **Type safety** - Slugs are included in the generated TypeScript types for your component props
4. **URL loading** - Your component's `urlLoader` can access these parameters to generate static paths

**Example component using slugs:**

```typescript
// The component receives slugs as part of props
interface ProductDetailProps {
  category: string; // From [category] slug
  productId: string; // From [productId] slug
}

async function* urlLoader(productsDb: ProductsService): AsyncIterable<ProductDetailProps[]> {
  const categories = await productsDb.getCategories();

  for (const category of categories) {
    const products = await productsDb.getProductsByCategory(category.slug);
    yield products.map((product) => ({
      category: category.slug,
      productId: product.id,
    }));
  }
}
```

### TypeScript Configuration

For proper type checking, extend Jay's TypeScript config:

**`tsconfig.json`:**

```json
{
  "extends": "@jay-framework/dev-environment/tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./lib",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["lib/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Best Practices

### 1. Version Your Contracts Carefully

Breaking changes to contracts affect all consumers:

```yaml
# ✅ Good - additive change (new optional field)
- tag: newFeature
  type: data
  dataType: string
  required: false
# ❌ Breaking - removing or renaming required fields
# - tag: oldField  # Don't delete required fields!
```

### 2. Document Your Components

Add descriptions to contracts and manifest:

```yaml
contracts:
  - name: weather-widget
    component: weatherWidget
    description: |
      Displays current weather for a location.
      Requires WEATHER_SERVICE to be registered in consumer app.
    contract: weather-widget.jay-contract
```

### 3. Test Before Publishing

Run the validator and build a test app:

```bash
npm run validate
npm run build
npm pack # Creates a .tgz file for local testing
```

Install in a test app:

```bash
npm install /path/to/my-plugin-1.0.0.tgz
```

### 4. Handle Errors Gracefully

Return error responses instead of throwing:

```typescript
import {
  phaseOutput,
  serverError5xx,
  notFound,
} from '@jay-framework/fullstack-component';

.withFastRender(async (props, dataService) => {
  try {
    const data = await dataService.getData(props.id);

    if (!data) {
      return notFound('Data not found');
    }

    return phaseOutput({ data }, {});
  } catch (error) {
    console.error('Failed to load data:', error);
    return serverError5xx(503, 'Service temporarily unavailable');
  }
})
```

### 5. Keep Client Bundles Small

Use code splitting to minimize client bundle size:

```typescript
// ✅ Good - server-only code is stripped by jayStackCompiler
async function slowlyRender(props, database) {
  const data = await database.query(/* ... */); // Stripped from client
  return phaseOutput({ data }, {});
}

// ❌ Avoid - large dependencies in interactive phase
function interactive(props, refs) {
  import('massive-library').then(/* ... */); // Bloats client bundle
}
```

### 6. Export a Single Manifest

Only one `plugin.yaml` per package:

```
✅ Good:
my-plugin/
  plugin.yaml
  lib/
    component-a.ts
    component-b.ts

❌ Bad:
my-plugin/
  plugin-a.yaml
  plugin-b.yaml  # Only one manifest supported
```

## Troubleshooting

### "Could not resolve plugin 'my-plugin'"

**Cause:** `plugin.yaml` not exported in `package.json`

**Fix:** Add to `package.json`:

```json
{
  "exports": {
    "./plugin.yaml": "./plugin.yaml"
  }
}
```

### "Contract file not found"

**Cause:** Contract not copied to `dist/` or not exported

**Fix:** Update build script:

```json
{
  "scripts": {
    "build:copy-contract": "cp lib/*.jay-contract* dist/"
  },
  "exports": {
    "./*.jay-contract": "./dist/*.jay-contract"
  }
}
```

### "Component 'myComponent' is not exported"

**Cause:** Component not exported from `index.ts`

**Fix:** Export from main entry:

```typescript
// lib/index.ts
export { myComponent } from './my-component';
```

### Validation Errors

Run validator with verbose output:

```bash
jay-stack-cli validate-plugin . --verbose
```

Common issues:

- Missing `module` field (required for local plugins)
- Invalid contract YAML syntax
- Mismatched export paths in `package.json`

### Build Failures

Check that all dependencies are installed:

```bash
npm install
```

Verify Vite configuration:

```bash
npx vite build --debug
```

Clean and rebuild:

```bash
npm run clean
npm run build
```

## Examples

### Simple Widget

See `examples/jay-stack/mood-tracker-plugin/` for a complete, minimal example.

### Full-Featured Plugin

See Design Log #60 for a comprehensive plugin with:

- Multiple contracts
- Service dependencies
- Dynamic contract generation
- Complex component interactions

## Next Steps

Now that you understand how to build Jay packages:

1. **Explore Examples** - Study the mood-tracker-plugin example
2. **Learn Advanced Patterns** - See [Jay Stack Components](./jay-stack.md)
3. **Publish Your Plugin** - Share with the community
4. **Contribute** - Help improve the Jay framework

---

Ready to build your first plugin? Start with the [Quick Start](#step-by-step-guide) guide above!
