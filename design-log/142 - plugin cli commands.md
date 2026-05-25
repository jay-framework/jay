# DL#142: Plugin CLI Commands

## Background

Plugins need to run administrative operations that don't belong in the rendering pipeline or the dev server request cycle. Example: a media plugin that uploads files from the project's `public/` folder to Wix Media, or a stores plugin that syncs product data from an external CMS.

Today plugins can declare:
- **Services** — initialized at startup, available to components and actions
- **Actions** — request-scoped server functions (`makeJayAction`/`makeJayQuery`) for client-server communication
- **Setup handlers** — run via `jay-stack setup`, create config files, validate credentials (DL#87)
- **References** — run via `jay-stack agent-kit`, generate discovery data for AI agents (DL#87)

None of these fit "upload media files" or "sync products":
- Actions are request-response — they need a running server and an HTTP caller
- Setup handlers are for config creation and validation, not arbitrary operations
- References are for generating data files, not side effects

## Problem

There's no mechanism for a plugin to expose a CLI command that:
1. Runs as a one-shot terminal operation (not a server endpoint)
2. Has access to initialized services (e.g., Wix Media API client)
3. Can accept arguments (e.g., folder path, flags)
4. Can show progress and output in the terminal
5. Is discoverable — the user knows what commands are available

### Use cases

1. **Media upload**: `jay-stack run media/upload-public` — uploads all files from `public/` to Wix Media, returns a URL mapping
2. **Product sync**: `jay-stack run stores/sync-catalog` — pulls product data from external CMS into local reference files
3. **Schema migration**: `jay-stack run data/migrate --dry-run` — runs database migrations declared by a plugin
4. **Cache clear**: `jay-stack run cdn/purge --all` — purges CDN cache for the site
5. **Cloud deployment**: `jay-stack run wix/deploy --env production` — deploys the built application to a cloud provider (uploads frontend to CDN, pushes backend container, runs health checks)

## Questions and Answers

**Q1: Should this be a new CLI command or extend an existing one?**

A1: New subcommand `jay-stack run <plugin>/<command>`. This parallels the existing `jay-stack action <plugin>/<action>` pattern but makes the distinction clear: actions are HTTP endpoints, commands are CLI operations. The `run` verb communicates "execute this thing once."

**Q2: Should commands be declared in plugin.yaml or auto-discovered?**

A2: Declared in `plugin.yaml`. This is consistent with how actions, services, webhooks, and setup handlers are declared. Explicit declaration provides discoverability (`jay-stack run --list`) and documentation (description field).

**Q3: Should command handlers get the same context as setup handlers?**

A3: Similar but not identical. Commands need services (like setup), but they also need typed input parsed from CLI arguments, and they don't need configDir. The handler uses a `makeCliCommand` builder with `.withServices()`, just like `makeJayAction`.

**Q4: How do commands declare their arguments?**

A4: In a `.jay-command` YAML file (same pattern as `.jay-action`). The file declares `inputSchema` with typed parameters. The CLI reads the schema and auto-generates commander flags — `--folder <string>`, `--dry-run` (boolean), etc. This means the CLI natively validates and parses arguments before calling the handler. No raw passthrough needed.

**Q5: Should commands run in a Vite context (for TypeScript loading)?**

A5: Yes. Same as `jay-stack setup` and `jay-stack action` — the handler module is loaded via `viteServer.ssrLoadModule()` so plugins can be authored in TypeScript. Services are initialized the same way.

**Q6: How does this relate to dev-time actions?**

A6: They're complementary. A dev-time action would be an HTTP endpoint available only during `jay-stack dev` — useful for UI-driven admin tools (editor panels, dashboards). A CLI command is for terminal-driven batch operations. Both have access to services. This design log covers CLI commands only. Dev-time actions can be added later if needed, likely as a `scope: dev` flag on `makeJayAction`.

**Q7: Should commands have access to the project's public folder path?**

A7: Yes. The `publicFolder` path (from project config or default `./public`) should be in the context. The media upload use case needs this directly.

**Q8: Can a command return structured data (like actions do)?**

A8: Yes. The handler returns a result object. The CLI renders it as JSON or YAML (with `--yaml` flag), same as `jay-stack action`. For progress output during execution, the handler uses the logger directly.

## Design

### 1. Console context service

A framework-provided service that gives CLI commands access to project info and a logger. Commands request it via `.withServices()` like any other service:

```typescript
import { createJayService } from '@jay-framework/fullstack-component';

export interface ConsoleContext {
    projectRoot: string;
    publicFolder: string;
    build: {
        frontend: string;
        backend: string;
    };
    verbose: boolean;
    log: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}

export const CONSOLE_CONTEXT = createJayService<ConsoleContext>('ConsoleContext');
```

The CLI registers this service before executing the command. Commands that don't need project info simply don't request it.

### 2. `makeCliCommand` builder

Follows the same builder pattern as `makeJayAction` — declares services, accepts typed input, returns success/failure:

```typescript
import { makeCliCommand } from '@jay-framework/fullstack-component';
import { MEDIA_SERVICE } from './services';
import { CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';

export const uploadPublic = makeCliCommand('upload-public')
    .withServices(MEDIA_SERVICE, CONSOLE_CONTEXT)
    .withHandler(async (input, mediaService, console) => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');

        const folder = input.folder || '';
        const publicPath = path.resolve(console.publicFolder, folder);
        const files = await fs.readdir(publicPath, { recursive: true });
        let count = 0;

        for (const file of files) {
            const filePath = path.join(publicPath, String(file));
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) continue;

            if (input.dryRun) {
                console.log(`[dry-run] Would upload ${file}`);
                continue;
            }

            const url = await mediaService.upload(filePath);
            console.log(`Uploaded ${file} → ${url}`);
            count++;
        }

        console.log(`Done. ${count} files uploaded.`);
        return { success: true };
    });
```

The builder produces a `JayCliCommand` object:

```typescript
interface JayCliCommand<Input> {
    commandName: string;
    services: ServiceMarkers<any[]>;
    handler: (input: Input, ...services: any[]) => Promise<{ success: boolean }>;
    _brand: 'JayCliCommand';
}
```

The handler returns `{ success: true }` or `{ success: false }`. The CLI maps this to exit code 0 or 1. All console output goes through the `ConsoleContext` logger (or any other service the command requests).

### 2. `.jay-command` metadata file

Like `.jay-action`, a YAML file declares the command's description and input schema:

```yaml
# upload-public.jay-command
name: upload-public
description: Upload files from the public folder to Wix Media

inputSchema:
  folder?: string      # Subfolder within public/ (default: entire public/)
  dryRun?: boolean     # Preview without uploading
```

No `outputSchema` — CLI commands write output directly to the console via a logger. The handler returns a success/failure status to determine exit code.

The CLI reads `inputSchema` and auto-generates commander flags:

- `folder?: string` → `--folder <value>` (optional string flag)
- `dryRun?: boolean` → `--dry-run` (boolean flag, camelCase → kebab-case)

Required fields (no `?`) become required flags — the CLI validates them before calling the handler.

### 3. Plugin manifest declaration

```yaml
# plugin.yaml
name: wix-media
commands:
  - name: upload-public
    command: upload-public.jay-command    # path to .jay-command file
  - name: clear-cache
    command: clear-cache.jay-command
```

The `command` field points to the `.jay-command` file (same as `action` pointing to `.jay-action`). The handler export is discovered by name from the plugin module (matching the command name, like actions).

### 4. CLI invocation

```bash
# Run a command — flags auto-generated from .jay-command inputSchema
jay-stack run media/upload-public --folder images --dry-run

# List available commands (from all plugins)
jay-stack run --list

# YAML output
jay-stack run stores/sync-catalog --yaml

# Verbose
jay-stack run media/upload-public -v
```

The CLI natively parses `--folder images` and `--dry-run` because it read the inputSchema. The handler receives `{ folder: 'images', dryRun: true }` — typed, validated, no manual parsing needed.

### 5. Discovery and execution flow

```
jay-stack run media/upload-public --folder images --dry-run
    │
    ├─ scanPlugins() → find plugins with `commands` in plugin.yaml
    ├─ Match "media/upload-public" → plugin "wix-media", command "upload-public"
    ├─ Read upload-public.jay-command → get inputSchema, description
    ├─ Auto-parse CLI flags from inputSchema → { folder: 'images', dryRun: true }
    ├─ createViteForCli() → TypeScript loading
    ├─ initializeServices() → register all plugin services
    ├─ Register CONSOLE_CONTEXT service (projectRoot, publicFolder, logger)
    ├─ viteServer.ssrLoadModule(pluginModule) → load handler export
    │
    ▼
    handler({ folder: 'images', dryRun: true }, mediaService, consoleContext)
    │
    ├─ Handler uses injected services and console context
    ├─ Writes output via consoleContext.log()
    │
    ▼
    Return { success: true }
    │
    └─ Exit 0 (success) or 1 (failure)
```

### 6. `--list` output

```
Available plugin commands:

  wix-media
    upload-public    Upload files from the public folder to Wix Media
    clear-cache      Clear media CDN cache

  wix-stores
    sync-catalog     Sync product catalog from external CMS

  wix-deploy
    deploy           Deploy application to Wix cloud
```

### 7. Input type mapping (`.jay-command` → CLI flags)

| Schema type | CLI flag | Example |
|-------------|----------|---------|
| `field: string` | `--field <value>` (required) | `--env production` |
| `field?: string` | `--field <value>` (optional) | `--folder images` |
| `field: boolean` | `--field` (required, must be present) | rare |
| `field?: boolean` | `--field` (optional flag) | `--dry-run` |
| `field: number` | `--field <value>` (required, parsed as number) | `--concurrency 4` |
| `field?: number` | `--field <value>` (optional number) | `--timeout 30` |

camelCase field names become kebab-case flags: `dryRun` → `--dry-run`.

### 8. `CONSOLE_CONTEXT` service

Registered by the CLI before executing the command. Available to any command that requests it via `.withServices(CONSOLE_CONTEXT)`. Commands that don't need project info simply don't request it — they only declare the services they need.

| Field | Type | Description |
|-------|------|-------------|
| `projectRoot` | `string` | Absolute path to project root |
| `publicFolder` | `string` | Absolute path to public folder |
| `build.frontend` | `string` | Absolute path to frontend build output (JS, CSS, public assets) |
| `build.backend` | `string` | Absolute path to backend build output (server modules, pre-rendered HTML) |
| `verbose` | `boolean` | Whether `-v` / `--verbose` was passed |
| `log(msg)` | `function` | Write info to console |
| `warn(msg)` | `function` | Write warning to console |
| `error(msg)` | `function` | Write error to console |

## Implementation Plan

### Phase 1: Builder and types

**`full-stack-component/lib/jay-command-builder.ts`** (new):
1. `makeCliCommand(name)` builder with `.withServices()` and `.withHandler()`
2. `JayCliCommand` interface (commandName, services, handler returns `{ success: boolean }`, `_brand`)
3. `isJayCliCommand()` type guard
4. `CONSOLE_CONTEXT` service marker and `ConsoleContext` interface
5. Export from package index

### Phase 2: Discovery and execution

**`stack-server-runtime/lib/plugin-commands.ts`** (new):
1. `discoverPluginCommands({ projectRoot, pluginFilter? })` — scans plugin.yaml for `commands`, resolves `.jay-command` files
2. `executePluginCommand(plugin, command, input, viteServer)` — loads handler via Vite, resolves services, calls handler
3. Parse `.jay-command` YAML — extract `inputSchema`, `description`, `outputSchema`
4. `commandSchemaToFlags(inputSchema)` — convert schema to commander option definitions

**`stack-server-runtime/lib/plugin-scanner.ts`**:
5. Add `commands` to `PluginManifest` type (optional array)

### Phase 3: CLI command

**`stack-cli/lib/run-command.ts`** (new):
1. `runCommand(commandRef, args, options, projectRoot, initializeServices)` handler
2. Parse `commandRef` as `pluginName/commandName`
3. Discover commands, read `.jay-command`, auto-generate flags from inputSchema
4. Parse CLI args against schema, validate required fields
5. Init Vite + services, register `CONSOLE_CONTEXT` with project info and logger
6. Execute handler, exit code from `{ success }` result
7. Handle `--list` flag

**`stack-cli/lib/cli.ts`**:
8. Register `run` command with `allowUnknownOption()` for schema-derived flags

### Phase 4: Documentation

**Agent-kit templates**:
1. Update `plugin/plugin-structure.md` — add `commands` field to plugin.yaml docs
2. Add `plugin/commands-guide.md` — how to write `makeCliCommand` handlers and `.jay-command` files

**`stack-cli/agent-kit-template/devops/`**:
3. Add reference to `jay-stack run` in devops guide

## Examples

### Media plugin — upload public files

```yaml
# plugin.yaml
name: wix-media
commands:
  - name: upload-public
    handler: uploadPublicCommand
    description: Upload public folder files to Wix Media
```

```bash
$ jay-stack run media/upload-public
Uploaded images/logo.png → https://static.wixstatic.com/media/abc123
Uploaded images/hero.jpg → https://static.wixstatic.com/media/def456
{
  "success": true,
  "message": "Uploaded 2 files",
  "data": {
    "uploaded": [
      { "local": "images/logo.png", "url": "https://static.wixstatic.com/media/abc123" },
      { "local": "images/hero.jpg", "url": "https://static.wixstatic.com/media/def456" }
    ]
  }
}
```

### Stores plugin — sync catalog

```yaml
# plugin.yaml
name: wix-stores
commands:
  - name: sync-catalog
    handler: syncCatalogCommand
    description: Sync product catalog to local reference files
```

```bash
$ jay-stack run stores/sync-catalog --yaml
success: true
message: Synced 47 products
data:
  products: 47
  categories: 5
  outputDir: agent-kit/references/wix-stores/
```

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| New CLI command (`run`) | Clear separation from actions and setup | One more command to learn |
| `makeCliCommand` builder | Consistent with `makeJayAction`, type-safe services | New builder to implement |
| `.jay-command` YAML (no outputSchema) | CLI auto-generates flags, validates input, self-documenting | Another file format (but mirrors `.jay-action`) |
| Native flag parsing from schema | No manual arg parsing in handlers, consistent UX | Schema must cover all parameters upfront |
| `CONSOLE_CONTEXT` service | Opt-in — commands request only what they need, no magic fields in input | One more framework service to know about |
| Handler returns `{ success }` only | Simple contract, output is console logs not structured data | No machine-readable output (use actions for that) |
| Service injection via builder | Same pattern as actions — plugins reuse service infrastructure | Requires full service initialization even for simple commands |
| Vite for TypeScript | Plugins authored in TypeScript seamlessly | Adds ~1s startup overhead |

## Verification Criteria

1. `jay-stack run --list` shows all plugin commands with descriptions
2. `jay-stack run media/upload-public` executes the handler with initialized services
3. `jay-stack run media/upload-public --yaml` outputs YAML instead of JSON
4. Handler receives `publicFolder` path in context
5. Handler can access services via `ctx.services`
6. Unknown plugin/command prints helpful error with available commands
7. Exit code 0 on success, 1 on failure
8. `--verbose` flag passed through to handler context
