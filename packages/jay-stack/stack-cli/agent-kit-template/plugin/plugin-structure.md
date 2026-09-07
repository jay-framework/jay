# Plugin Structure

A plugin provides headless components, contracts, and actions. It can be a standalone npm package or inline within a project.

## Capabilities & the runtime/tools split

A plugin package runs code in two very different phases, and they must **not** share one module graph:

- **Serve-time (runtime)** — headless components, production routes, **server actions**, the client
  bundle, global `init`. Loaded on the production request path. **Must stay compiler-free** — the
  serve bundle ships to production.
- **Tools-time** — validators, **CLI commands**, agent-kit generators, `setup` handlers, and
  `devOnly` route components/actions. Run only under the Jay toolchain (`jay-stack
validate`/`agent-kit`/`setup`/`run`, dev server). These **may** use the compiler.

**Actions vs commands** — the load-bearing distinction:

- **Actions** are the _serving_ primitive: request-time handlers that run in production. They live on
  the `.` entry and **must be compiler-free**.
- **CLI commands** are the _tools_ primitive: invoked under the toolchain. They live on `./tools` and
  **may use the compiler**.

Rule of thumb: **if a handler needs the compiler, it is a command (or a `devOnly` action), not a
regular action.**

### Capability → required export

Derive a plugin's required `package.json` exports from the capabilities it declares:

| Capability (plugin.yaml)    | Needs `./client`?          | Handler/export loaded from      |
| --------------------------- | -------------------------- | ------------------------------- |
| `contracts`                 | only if interactive phase  | `.` (+ `./<contract>` per item) |
| `dynamic_contracts`         | only if interactive phase  | `.`                             |
| `routes`                    | only if interactive phase  | `.` (or `./tools` if `devOnly`) |
| `contexts`                  | ✅ always (client by def.) | `.`, `./client`                 |
| `actions`                   | ❌                         | `.` (or `./tools` if `devOnly`) |
| `services`, `init` / global | ❌                         | `.`                             |
| `validators`                | ❌                         | **`./tools`**                   |
| `commands`                  | ❌                         | **`./tools`**                   |
| `agentkit` / `setup`        | ❌                         | **`./tools`**                   |

Rules `jay-stack validate-plugin` enforces:

- **≥1 capability.** A plugin declaring none is flagged (a `global: true` plugin counts iff it exports
  a resolvable `init`/`setup` handler).
- **`./tools` required** iff any tools capability (`validators`, `commands`, `agentkit`, `setup`) or a
  `devOnly` action is declared.
- **`./client` required** iff a provided component has an interactive phase, or `contexts` is declared.
  Server-only and tools-only plugins need no `./client`.
- **Leak scan:** `dist/index.js` (the `.` entry) must contain no `@jay-framework/compiler-` import.

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

webhooks:
  - name: onProductChange
  - name: onInventoryUpdate

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

commands:
  - name: upload-public
    command: commands/upload-public.jay-command
  - name: sync-catalog
    command: commands/sync-catalog.jay-command

validators:
  - name: media-optimization
    handler: validateMediaOptimization
    description: Ensures media URLs use resize parameters

setup: setup-handler
agentkit: agentkit-handler
description: Configure My Plugin
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
    link: '@my-org/my-plugin/media-gallery' # package path — works from any directory
    # NOT: link: ./media-gallery            # relative path — breaks in materialized location
```

### Action Entry Fields

- `name` — Action name (used with `jay-stack action <plugin>/<action>`)
- `action` — Path to `.jay-action` metadata file
- `devOnly` — (optional, boolean) When `true`, the action's handler lives in `./tools` (compiler
  allowed), is served by the dev server, and is **excluded from production builds**. Use for
  settings-page / admin handlers. A non-`devOnly` action's handler must be compiler-free on `.`. See
  [plugin-routes.md](plugin-routes.md) for the settings-page pattern.

### Webhook Entry Fields

- `name` — Export name of the `makeWebhook()` constant (e.g., `onProductChange`)

Webhooks are exposed at `POST /_jay/webhooks/{webhookName}` on the renderer server. The `webhookName` comes from the `makeWebhook('plugin.event-name')` call, not from the export name. The export name in plugin.yaml tells the framework which export to load from the plugin module.

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
- `devOnly` — (optional, boolean) When `true`, the route is dev-server tooling (e.g. a settings UI):
  served by the dev server, **excluded from production builds**. A `devOnly` route whose page
  component uses the compiler resolves its component from `./tools`.

Plugin routes are served by the dev server alongside project routes. If a project defines the same route path, the project's page takes precedence.

### Command Entry Fields

- `name` — Command name (used with `jay-stack run <plugin>/<command>`)
- `command` — (optional) Path to `.jay-command` metadata file (declares description and input schema)

Commands are CLI operations run via `jay-stack run`. Use `makeCliCommand()` to create handlers with service injection. See [commands-guide.md](commands-guide.md).

### Validator Entry Fields

- `name` — Validator name (shown in validation output as `plugin-name/validator-name`)
- `handler` — Export name (NPM plugins) or relative path (local plugins) to the validator function
- `description` — (optional) What this validator checks

**NPM plugins:** `handler` is the export name from the **`./tools`** entry (e.g., `validateMediaOptimization`). The function must be exported from `lib/tools.ts` — **never re-export a validator (or any compiler-using handler) from `lib/index.ts`**, or the compiler leaks into the serve bundle.  
**Local plugins:** `handler` is a relative path to the module (e.g., `./validators/media-validator`). The module must export a `validate` function.

Validators run during `jay-stack validate` against every parsed jay-html file in the project. See [validation.md](validation.md) for implementation details.

### Setup and agent-kit fields

- `setup` — Export name (NPM) or relative path (local) for `jay-stack setup <plugin>`. Creates config files, validates credentials and services.
- `agentkit` — Export name (NPM) or relative path (local) for `jay-stack agent-kit`. Generates discovery data: add-menu catalogs, reference files, skills, thumbnails.
- `description` — (optional, top-level) Human-readable description of what setup validates

**NPM plugins:** `setup` and `agentkit` are export names from the **`./tools`** entry (`lib/tools.ts`) — they are tools-time handlers and may use the compiler.  
**Local plugins:** relative paths to the handler modules.

`jay-stack validate-plugin` checks that declared handlers exist and are correctly exported.

See [setup-guide.md](setup-guide.md) for implementation details.

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
│   ├── commands/
│   │   └── upload-public.jay-command
│   ├── webhooks/
│   │   └── on-product-change.ts
│   ├── validators/
│   │   └── media-validator.ts
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

## Entry Points

Jay plugins run in three contexts. The build produces up to three bundles:

- **Server / serve** (`dist/index.js`, `.`) — actions, services, SSR rendering, `init()`. Loaded on
  the production request path. **Compiler-free.** Built with `vite build --ssr`.
- **Client** (`dist/index.client.js`, `./client`) — components for hydration, context tokens,
  `init()`. Built with `vite build`.
- **Tools** (`dist/tools.js`, `./tools`) — validators, commands, agent-kit/setup handlers, and any
  `devOnly` route component/action. **Compiler-allowed** (toolchain-only, never in a serve bundle).
  Built alongside the server bundle (`vite build --ssr`).

Create the entry files:

| File                  | Exports                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `lib/index.ts`        | Actions, services, components (SSR), init, service markers — **compiler-free**                         |
| `lib/index.client.ts` | Components (hydration), context markers, init                                                          |
| `lib/tools.ts`        | Validators, commands, agent-kit/setup handlers, `devOnly` route components + actions — **compiler OK** |

Actions and service providers are server-only. Components appear in **both** `index.ts` and
`index.client.ts`. **`index.ts` must never import `tools.ts`** — that is what keeps the compiler out of
the serve bundle. A validator-only or tools-only plugin may have a near-empty `index.ts`.

## Build Scripts

```json
{
  "scripts": {
    "build": "npm run clean && npm run definitions && npm run build:client && npm run build:server && npm run build:copy-assets && npm run build:types && npm run validate",
    "definitions": "jay-cli definitions lib",
    "build:client": "vite build",
    "build:server": "vite build --ssr",
    "build:copy-assets": "cp lib/*.jay-contract* dist/",
    "build:types": "tsup lib/index.ts lib/index.client.ts lib/tools.ts --dts-only --format esm",
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
        ? {
            index: resolve(__dirname, 'lib/index.ts'),
            // Tools entry (compiler-allowed, toolchain-only). Omit if the plugin has no
            // validators/commands/agentkit/setup/devOnly surfaces.
            tools: resolve(__dirname, 'lib/tools.ts'),
          }
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
        // Externalize the compiler namespace: any leak into `.` then shows up as a literal
        // import string in dist/index.js, which validate-plugin's leak scan catches.
        /^@jay-framework\/compiler-/,
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
    "./tools": {
      "types": "./dist/tools.d.ts",
      "default": "./dist/tools.js"
    },
    "./plugin.yaml": "./plugin.yaml",
    "./my-contract.jay-contract": "./dist/my-contract.jay-contract"
  },
  "files": ["dist", "plugin.yaml"]
}
```

- The `.` export handles server-side rendering and action execution — it must be **compiler-free**.
- The `./client` export is required **only** when a component has an interactive phase or the plugin
  declares `contexts` (browser-side hydration / client contexts).
- The `./tools` export is required **only** when the plugin declares a tools capability (`validators`,
  `commands`, `agentkit`, `setup`) or a `devOnly` action — those handlers load exclusively from
  `./tools`.

### compiler-\* dependencies

If `./tools` uses the compiler (`@jay-framework/compiler-jay-html`, `compiler-shared`), declare those
packages as **`peerDependencies`** (provided by the toolchain at tools time) plus **`devDependencies`**
(so the plugin's own build/test resolve them). Never put them in `dependencies` — that would pull the
compiler into runtime installs.

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

For NPM packages, include `agent-kit` in the `files` array:

```json
{
  "files": ["dist", "plugin.yaml", "agent-kit"]
}
```

No `plugin.yaml` declaration needed — the CLI discovers guides by scanning the `agent-kit/` directory. Files are copied as-is into the project's `agent-kit/{role}/`.

**File format convention:** The first line after the `#` heading is used as the description in the INSTRUCTIONS.md index table. Write it as a short sentence explaining when to use this guide:

```markdown
# Scroll Carousel

Horizontal slider with prev/next buttons and edge detection. Headless component — requires import.

## Import

...
```

The INSTRUCTIONS.md table will show:

```
| scroll-carousel.md | my-plugin | Horizontal slider with prev/next buttons and edge detection. Headless component — requires import. |
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
