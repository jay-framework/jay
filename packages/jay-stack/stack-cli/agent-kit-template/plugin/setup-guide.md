# Plugin Setup & Agent-Kit

Plugins can provide two hooks for project configuration and AI agent discovery:

- **Setup handler** (`setup` in `plugin.yaml`) — runs during `jay-stack setup <plugin>`. Creates config files, validates credentials.
- **Agent-kit handler** (`agentkit` in `plugin.yaml`) — runs during `jay-stack agent-kit`. Generates discovery data (add-menu catalogs, reference files, skills, thumbnails) using live services when needed.

## When Each Runs

```
jay-stack setup <plugin>     →  setup handler (config + credentials)
jay-stack agent-kit          →  agentkit handler (after contract materialization)
```

Setup runs when a project configures the plugin. Agent-kit runs whenever the developer regenerates the agent kit — it can use live services to produce fresh data.

## Declaring in plugin.yaml

```yaml
name: my-plugin
setup: setupMyPlugin # export name (NPM) or ./path (local) — optional
agentkit: generateMyAgentKit # export name (NPM) or ./path (local) — optional
description: Validate credentials and install config # optional, top-level
```

**NPM plugins:** `setup` and `agentkit` are export names from the package entry point (`lib/index.ts`).  
**Local plugins:** relative paths to handler modules (e.g. `agentkit: ./agentkit` — export `agentkit` or `default` from that module).

`jay-stack validate-plugin` checks that declared handlers exist and are correctly exported.

## Writing a Setup Handler

The setup handler creates config files, validates services, and can prompt the user for credentials. It receives a `PluginSetupContext` and returns a `PluginSetupResult`.

**Do not** write add-menu catalogs in setup — use the agent-kit handler.

### Basic setup (non-interactive)

```typescript
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import fs from 'node:fs';
import path from 'node:path';

export async function setupMyPlugin(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  if (ctx.initError) {
    return { status: 'error', message: `Init failed: ${ctx.initError.message}` };
  }

  const configCreated: string[] = [];
  const configPath = path.join(ctx.configDir, '.my-plugin.yaml');

  if (!fs.existsSync(configPath) || ctx.force) {
    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(configPath, '# My Plugin config\napiKey: "<your-api-key>"\n', 'utf-8');
    configCreated.push('config/.my-plugin.yaml');
  }

  return {
    status: 'configured',
    configCreated,
    message:
      configCreated.length > 0
        ? 'My Plugin config installed.'
        : 'My Plugin config already present (use --force to rewrite).',
  };
}
```

### Interactive setup (with prompts)

When the setup handler needs user input (API keys, credentials, configuration choices), use `ctx.prompt`:

```typescript
export async function setupMyPlugin(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  const configPath = path.join(ctx.configDir, '.my-plugin.yaml');

  // Already configured — skip unless --force
  if (fs.existsSync(configPath) && !ctx.force) {
    return { status: 'configured', message: 'Already configured' };
  }

  // In non-interactive mode, create a template and ask the user to fill it in later
  if (!ctx.interactive) {
    fs.mkdirSync(ctx.configDir, { recursive: true });
    fs.writeFileSync(configPath, 'apiKey: "<your-api-key>"\n', 'utf-8');
    return {
      status: 'needs-config',
      configCreated: ['config/.my-plugin.yaml'],
      message: 'Run `jay-stack-cli setup` interactively to enter your API key',
    };
  }

  // Interactive mode — prompt the user
  const apiKey = await ctx.prompt.input({
    message: 'Enter your API key (create one at https://example.com/api-keys):',
    validate: (v) => (v.trim() ? true : 'API key is required'),
  });

  const region = await ctx.prompt.select({
    message: 'Select your region:',
    choices: [
      { name: 'US East', value: 'us-east' },
      { name: 'EU West', value: 'eu-west' },
    ],
  });

  fs.mkdirSync(ctx.configDir, { recursive: true });
  fs.writeFileSync(configPath, `apiKey: "${apiKey.trim()}"\nregion: ${region}\n`, 'utf-8');

  return {
    status: 'configured',
    configCreated: ['config/.my-plugin.yaml'],
    message: 'Credentials configured successfully',
  };
}
```

### Setup modes

Setup runs in three modes:

| Mode                          | Command                                   | `ctx.interactive` | `ctx.prompt` behavior                                 |
| ----------------------------- | ----------------------------------------- | ----------------- | ----------------------------------------------------- |
| **Default** (agents, CI)      | `jay-stack-cli setup`                     | `false`           | Throws `SetupNeedsAnswerError` with structured output |
| **Interactive** (humans)      | `jay-stack-cli setup --interactive`       | `true`            | Prompts via terminal                                  |
| **Answers file** (automation) | `jay-stack-cli setup --answers file.yaml` | `false`           | Reads from file, throws if missing                    |

In default mode, when a prompt has no answer, the CLI exits with structured YAML telling the caller what's needed. Agents can then provide the answer via `--answers` and re-run.

### Idempotency requirement

Setup handlers **must be idempotent** — re-running with the same answers must produce the same result without side effects. This is critical because:

- Agents re-run setup iteratively as they provide answers one at a time
- Users re-run setup after fixing credentials
- CI pipelines may run setup on every deploy

**Rules:**

1. Check if config already exists before creating it — skip if present (unless `ctx.force`)
2. Check if credentials are already valid before prompting — skip if configured
3. Never append to files — write the complete content each time
4. Use `ctx.force` to allow explicit re-creation when the user asks for it

```typescript
export async function setupMyPlugin(ctx: PluginSetupContext): Promise<PluginSetupResult> {
  const configPath = path.join(ctx.configDir, '.my-plugin.yaml');

  // Idempotent: skip if already configured (unless --force)
  if (fs.existsSync(configPath) && !ctx.force) {
    // Optionally validate the existing config
    return { status: 'configured', message: 'Already configured' };
  }

  // Prompt only when needed
  const apiKey = await ctx.prompt.input({
    key: 'api-key',
    message: 'Enter your API key:',
  });

  // Write complete config (not append)
  fs.writeFileSync(configPath, `apiKey: "${apiKey}"\n`);
  return { status: 'configured', configCreated: ['config/.my-plugin.yaml'] };
}
```

### PluginSetupContext

| Field         | Type                | Description                                                       |
| ------------- | ------------------- | ----------------------------------------------------------------- |
| `pluginName`  | `string`            | Plugin name from plugin.yaml                                      |
| `projectRoot` | `string`            | Absolute project root path                                        |
| `configDir`   | `string`            | Config directory (from `.jay` configBase, defaults to `./config`) |
| `services`    | `Map`               | Registered services (may be empty if init failed)                 |
| `initError`   | `Error?`            | Present if plugin init failed — check this before using services  |
| `force`       | `boolean`           | Whether `--force` flag was passed                                 |
| `interactive` | `boolean`           | Whether running in interactive mode (can prompt user)             |
| `prompt`      | `PluginSetupPrompt` | Prompt functions for user input (see below)                       |

### PluginSetupPrompt

| Method    | Signature                                          | Description                                                |
| --------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `input`   | `(opts: { message, validate? }) → Promise<string>` | Text input. Non-interactive: returns `""`                  |
| `confirm` | `(opts: { message, default? }) → Promise<boolean>` | Yes/no. Non-interactive: returns `default` or `false`      |
| `select`  | `(opts: { message, choices }) → Promise<string>`   | Single choice. Non-interactive: returns first choice value |

### PluginSetupResult

| Field           | Type                                        | Description                                     |
| --------------- | ------------------------------------------- | ----------------------------------------------- |
| `status`        | `'configured' \| 'needs-config' \| 'error'` | Overall result                                  |
| `configCreated` | `string[]?`                                 | Config files created (relative to project root) |
| `message`       | `string?`                                   | Human-readable status message                   |

## Writing an Agent-Kit Handler

The agent-kit handler generates discovery data at agent-kit time: add-menu catalogs, `agent-kit/references/<plugin>/` files, skills, thumbnails. It can use live services (database queries, API calls) to produce dynamic content.

```typescript
import type {
  PluginAgentKitContext,
  PluginAgentKitResult,
} from '@jay-framework/stack-server-runtime';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

export async function generateMyAgentKit(
  ctx: PluginAgentKitContext,
): Promise<PluginAgentKitResult> {
  if (ctx.initError) {
    return { agentKitCreated: [], message: `Skipped: ${ctx.initError.message}` };
  }

  const outputPath = path.join(ctx.projectRoot, 'agent-kit/aiditor/add-menu/my-plugin.yaml');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const items = [
    { id: 'my-plugin:feature-1', title: 'Feature 1', category: 'My Plugin', prompt: '...' },
  ];
  fs.writeFileSync(outputPath, yaml.stringify({ items }), 'utf-8');

  return {
    agentKitCreated: ['agent-kit/aiditor/add-menu/my-plugin.yaml'],
    message: `Generated ${items.length} add-menu items`,
  };
}
```

### PluginAgentKitContext

| Field           | Type      | Description                                                     |
| --------------- | --------- | --------------------------------------------------------------- |
| `pluginName`    | `string`  | Plugin name from plugin.yaml                                    |
| `projectRoot`   | `string`  | Absolute project root path                                      |
| `referencesDir` | `string`  | Directory for reference data (`agent-kit/references/<plugin>/`) |
| `services`      | `Map`     | Registered services                                             |
| `initError`     | `Error?`  | Present if plugin init failed                                   |
| `force`         | `boolean` | Whether `--force` flag was passed                               |

### PluginAgentKitResult

| Field             | Type       | Description                              |
| ----------------- | ---------- | ---------------------------------------- |
| `agentKitCreated` | `string[]` | Files created (relative to project root) |
| `message`         | `string?`  | Human-readable status message            |

## Setup vs Agent-Kit — When to Use Which

| Use case                                                             | Hook       | Why                                                         |
| -------------------------------------------------------------------- | ---------- | ----------------------------------------------------------- |
| Copy static add-menu template, skills, thumbnails                    | `agentkit` | Discovery data — regenerated on `jay-stack agent-kit`       |
| Generate data from live services (product catalogs, CMS schemas)     | `agentkit` | Needs services initialized; refreshed on each agent-kit run |
| Validate credentials / API keys                                      | `setup`    | Part of initial project configuration                       |
| Write AIditor add-menu from project-specific data (DESIGN.md tokens) | `agentkit` | Data comes from project files at agent-kit time             |

## AIditor Add-Menu Items

The agent-kit handler writes to `agent-kit/aiditor/add-menu/<plugin-name>.yaml`. The AIditor discovers and loads all YAML files in this directory.

Each item:

```yaml
items:
  - id: my-plugin:feature-name # unique ID
    title: Feature Name # shown in the add menu
    category: My Plugin # grouping
    subCategory: Components # sub-grouping
    pluginName: my-plugin # optional: plugin attribution
    packageName: '@my-org/my-plugin' # optional: npm package name
    prompt: | # instructions for the AI agent
      Use headless component @my-org/my-plugin / contract feature-name.
      Read agent-kit/designer/feature-name.md for usage guide.
```

See `agent-kit/plugin/aiditor-add-menu.md` (installed by `jay-stack setup aiditor`) for the full contributor guide.

## Exporting Handlers

For NPM plugins, export handlers from the package entry point:

```typescript
// lib/index.ts
export { setupMyPlugin } from './setup.js';
export { generateMyAgentKit } from './agentkit.js';
// ... other exports (components, actions, services)
```

For local plugins, use relative paths in `plugin.yaml` and export `agentkit` or `default` from the handler module.
