# Plugin Structure

A plugin provides headless components, contracts, and actions. It can be a standalone npm package or inline within a project.

## plugin.yaml

The plugin manifest declares all contracts, actions, services, contexts, and configuration:

```yaml
name: my-plugin
contracts:
  - name: product-page
    contract: product-page.jay-contract
    component: productPage
    description: Complete product detail page with SSR

  - name: product-search
    contract: product-search.jay-contract
    component: productSearch
    description: Product listing with filters and pagination

dynamic_contracts:
  # Single contract: prefix used as the contract name directly
  - prefix: product-page
    component: productPage
    generator: productPageContractGenerator
  # Multiple contracts: prefix/name format (e.g., list/recipes, list/articles)
  - prefix: list
    component: dynamicList
    generator: listContractGenerator

actions:
  - name: searchProducts
    action: search-products.jay-action
  - name: addToCart
    action: add-to-cart.jay-action

services:
  - name: my-store
    marker: MY_STORE_SERVICE_MARKER
    description: Provides product catalog API (query, filter, sort)

contexts:
  - name: my-cart
    marker: MY_CART_CONTEXT
    description: Client-side cart state (add/remove items, totals)

routes:
  - path: /admin/dashboard
    jayHtml: ./pages/admin/page.jay-html
    component: ./pages/admin/page.ts
    description: Admin dashboard with product stats

setup:
  handler: setup-handler
  references: references-handler
  configTemplate:
    - source: templates/config.yaml
      target: my-plugin.yaml
```

### Contract Entry Fields

- `name` — Contract name (used in `contract="..."` in jay-html)
- `contract` — Path to `.jay-contract` file (relative to plugin root)
- `component` — Export name of the component (e.g., `productPage`)
- `description` — What this component does and when to use it

### Dynamic Contract Entry Fields

Dynamic contracts are generated at setup time from site-specific data (e.g., CMS collection schemas, extended product fields).

- `prefix` — Identifier for this dynamic contract group. Used as the contract name for single contracts, or as `prefix/name` for multiple.
- `component` — Export name of the headless component that serves these contracts
- `generator` — Export name of the generator function that produces contract YAML

**Single contract** — generator returns one `{ yaml }` without a name:

```yaml
dynamic_contracts:
  - prefix: product-page
    component: productPage
    generator: productPageContractGenerator
```

Referenced as `contract="product-page"` in jay-html.

**Multiple contracts** — generator yields `{ name, yaml }` for each:

```yaml
dynamic_contracts:
  - prefix: list
    component: dynamicList
    generator: listContractGenerator
```

Referenced as `contract="list/recipes"`, `contract="list/articles"` etc.

Contracts are materialized by `jay-stack agent-kit` or `jay-stack setup` and stored in `agent-kit/materialized-contracts/`.

**Linking to static contracts from generated YAML** — materialized contracts live in a different directory than the plugin source. Use the plugin's package path (not relative paths) for `link:` references to static contracts:

```yaml
# In the generated contract YAML:
tags:
  - tag: gallery
    type: sub-contract
    link: "@my-org/my-plugin/media-gallery"   # package path — works from any directory
    # NOT: link: ./media-gallery            # relative path — breaks in materialized location
```

### Action Entry Fields

- `name` — Action name (used with `jay-stack action <plugin>/<action>`)
- `action` — Path to `.jay-action` metadata file

### Service Entry Fields

- `name` — Service name (for identification in plugins-index)
- `marker` — Exported service marker constant (e.g., `MY_STORE_SERVICE_MARKER`)
- `description` — What APIs this service provides
- `doc` — (optional) Path to a markdown file documenting the service API

Services are server-side APIs created with `createJayService`. Other plugins and page components consume them via `.withServices(MARKER)`.

### Context Entry Fields

- `name` — Context name (for identification in plugins-index)
- `marker` — Exported context marker constant (e.g., `MY_CART_CONTEXT`)
- `description` — What reactive state this context provides
- `doc` — (optional) Path to a markdown file documenting the context API

Contexts are client-side reactive state. Other plugins and page components consume them via `.withContexts(MARKER)`.

### Documentation Files

When `doc` is specified, the markdown file must exist and (for NPM packages) be exported in `package.json`:

```yaml
services:
  - name: my-store
    marker: MY_STORE_SERVICE_MARKER
    description: Product catalog API
    doc: ./docs/my-store-service.md
```

```json
{
  "exports": {
    "./docs/my-store-service.md": "./docs/my-store-service.md"
  }
}
```

### Route Entry Fields

- `path` — Route path (e.g., `/admin/products`, `/dashboard/[section]`)
- `jayHtml` — Path to the page's jay-html template (relative to plugin root, or export subpath for NPM)
- `css` — (optional) Path to the page's CSS file
- `component` — Path to the page component (relative to plugin root, or exported member name for NPM)
- `description` — What this page does

Plugin routes are served by the dev server alongside project routes. If a project defines the same route path, the project's page takes precedence.

### Setup Fields

- `handler` — Setup handler for `jay-stack setup` (handles config, credentials)
- `references` — Reference generator for `jay-stack agent-kit` (generates discovery data)
- `configTemplate` — Config file templates to copy during setup

## Package Layout

### Standalone NPM Package

```
my-plugin/
├── plugin.yaml
├── package.json
├── lib/
│   ├── contracts/
│   │   ├── product-page.jay-contract
│   │   └── product-search.jay-contract
│   ├── actions/
│   │   ├── search-products.jay-action
│   │   └── add-to-cart.jay-action
│   ├── components/
│   │   ├── product-page.ts
│   │   └── product-search.ts
│   ├── services/
│   │   └── products-db.ts
│   └── init.ts
├── agent-kit/                    # Optional: plugin-contributed guides
│   ├── designer/
│   │   └── my-plugin-usage.md
│   └── developer/
│       └── my-plugin-config.md
└── dist/
```

### Inline Plugin (within a project)

```
my-project/
├── src/
│   ├── pages/
│   │   └── ...
│   └── plugins/
│       └── my-plugin/
│           ├── plugin.yaml
│           ├── product-page.jay-contract
│           ├── product-page.ts
│           └── init.ts
```

See `examples/jay-stack/fake-shop` for a working example.

## Dual Entry Points

Jay plugins are fullstack — they run on both server and client. The build produces two bundles:

- **Server** (`dist/index.js`) — actions, services, SSR rendering, `init()`. Built with `vite build --ssr`.
- **Client** (`dist/index.client.js`) — components for hydration, context tokens, `init()`. Built with `vite build`.

Create two entry files:

| File                  | Exports                                                    |
| --------------------- | ---------------------------------------------------------- |
| `lib/index.ts`        | Actions, services, components (SSR), init, service markers |
| `lib/index.client.ts` | Components (hydration), context markers, init              |

Actions and service providers are server-only. Components appear in **both** entries.

## Build Scripts

```json
{
  "scripts": {
    "build": "npm run clean && npm run definitions && npm run build:client && npm run build:server && npm run build:copy-assets && npm run build:types && npm run validate",
    "definitions": "jay-cli definitions lib",
    "build:client": "vite build",
    "build:server": "vite build --ssr",
    "build:copy-assets": "cp lib/*.jay-contract* dist/",
    "build:types": "tsup lib/index.ts lib/index.client.ts --dts-only --format esm",
    "validate": "jay-stack-cli validate-plugin",
    "clean": "rimraf dist"
  }
}
```

The `vite.config.ts` uses `isSsrBuild` to switch entry points:

```typescript
import { resolve } from 'path';
import { defineConfig } from 'vite';
import { jayStackCompiler } from '@jay-framework/compiler-jay-stack';

const jayOptions = { tsConfigFilePath: resolve(__dirname, 'tsconfig.json'), outputDir: 'build' };

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [...jayStackCompiler(jayOptions)],
  build: {
    minify: false,
    ssr: isSsrBuild,
    emptyOutDir: false,
    lib: {
      entry: isSsrBuild
        ? { index: resolve(__dirname, 'lib/index.ts') }
        : { 'index.client': resolve(__dirname, 'lib/index.client.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@jay-framework/component',
        '@jay-framework/fullstack-component',
        '@jay-framework/stack-client-runtime',
        '@jay-framework/stack-server-runtime',
        '@jay-framework/reactive',
        '@jay-framework/runtime',
      ],
    },
  },
}));
```

## package.json Exports

For NPM packages, declare exports for both server and client entry points:

```json
{
  "name": "@my-org/my-plugin",
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/index.client.d.ts",
      "default": "./dist/index.client.js"
    },
    "./plugin.yaml": "./plugin.yaml",
    "./my-contract.jay-contract": "./dist/my-contract.jay-contract"
  },
  "files": ["dist", "plugin.yaml"]
}
```

The `./client` export is required — the framework uses it for browser-side hydration code. The `.` export handles server-side rendering and action execution.

## Plugin-Contributed Agent-Kit Guides

A plugin can include guides that are merged into the project's agent-kit during `jay-stack agent-kit`. Create an `agent-kit/` folder with subfolders for each role:

```
my-plugin/
└── agent-kit/
    ├── designer/
    │   └── my-plugin-usage.md    # How to use contracts in jay-html
    ├── developer/
    │   └── my-plugin-config.md   # How to configure the plugin
    └── plugin/
        └── my-plugin-extending.md  # How to extend the plugin
```

## Reference Declarations

Plugins can declare reference data generated by `jay-stack agent-kit`:

```yaml
# In plugin.yaml
references:
  - name: product-catalog
    description: All products with IDs, slugs, names, and prices
    file: product-catalog.json
  - name: collection-schemas
    description: Collection field schemas for filtering
    file: collection-schemas.json
```

The `agent-kit` command generates `references/<plugin>/INDEX.md` from these declarations.
