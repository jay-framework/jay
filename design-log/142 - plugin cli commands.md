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

## Questions and Answers

**Q1: Should this be a new CLI command or extend an existing one?**

A1: New subcommand `jay-stack run <plugin>/<command>`. This parallels the existing `jay-stack action <plugin>/<action>` pattern but makes the distinction clear: actions are HTTP endpoints, commands are CLI operations. The `run` verb communicates "execute this thing once."

**Q2: Should commands be declared in plugin.yaml or auto-discovered?**

A2: Declared in `plugin.yaml`. This is consistent with how actions, services, webhooks, and setup handlers are declared. Explicit declaration provides discoverability (`jay-stack run --list`) and documentation (description field).

**Q3: Should command handlers get the same context as setup handlers?**

A3: Similar but not identical. Commands need services (like setup), but they also need parsed CLI arguments, and they don't need configDir. The context should include `projectRoot`, `services`, and a typed `args` record.

**Q4: How do commands declare their arguments?**

A4: In plugin.yaml, as a simple list with name, description, and optional default. The CLI parses them positionally or as flags. Keep it minimal — plugins that need complex argument parsing can do it themselves inside the handler.

**Q5: Should commands run in a Vite context (for TypeScript loading)?**

A5: Yes. Same as `jay-stack setup` and `jay-stack action` — the handler module is loaded via `viteServer.ssrLoadModule()` so plugins can be authored in TypeScript. Services are initialized the same way.

**Q6: How does this relate to dev-time actions?**

A6: They're complementary. A dev-time action would be an HTTP endpoint available only during `jay-stack dev` — useful for UI-driven admin tools (editor panels, dashboards). A CLI command is for terminal-driven batch operations. Both have access to services. This design log covers CLI commands only. Dev-time actions can be added later if needed, likely as a `scope: dev` flag on `makeJayAction`.

**Q7: Should commands have access to the project's public folder path?**

A7: Yes. The `publicFolder` path (from project config or default `./public`) should be in the context. The media upload use case needs this directly.

**Q8: Can a command return structured data (like actions do)?**

A8: Yes. The handler returns a result object. The CLI renders it as JSON or YAML (with `--yaml` flag), same as `jay-stack action`. For progress output during execution, the handler uses the logger directly.

## Design

### 1. Plugin manifest declaration

```yaml
# plugin.yaml
name: wix-media
commands:
  - name: upload-public
    handler: uploadPublicCommand    # export name from plugin module
    description: Upload public folder files to Wix Media
  - name: clear-cache
    handler: clearCacheCommand
    description: Clear media CDN cache
```

The `handler` is an export name resolved from the plugin's main module (same pattern as `setup.handler`).

### 2. Command handler interface

```typescript
export interface PluginCommandContext {
    pluginName: string;
    projectRoot: string;
    publicFolder: string;
    args: string[];
    options: Record<string, string | boolean>;
    services: Map<symbol, unknown>;
    verbose: boolean;
}

export interface PluginCommandResult {
    success: boolean;
    message?: string;
    data?: unknown;
}

export type PluginCommandHandler = (ctx: PluginCommandContext) => Promise<PluginCommandResult>;
```

### 3. Handler example (media upload)

```typescript
// In plugin module (e.g., lib/index.ts)
import { MEDIA_SERVICE } from './services';

export const uploadPublicCommand: PluginCommandHandler = async (ctx) => {
    const mediaService = ctx.services.get(MEDIA_SERVICE as any);
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const files = await fs.readdir(ctx.publicFolder, { recursive: true });
    const uploaded: Array<{ local: string; url: string }> = [];

    for (const file of files) {
        const filePath = path.join(ctx.publicFolder, file);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) continue;

        const url = await mediaService.upload(filePath);
        uploaded.push({ local: file, url });
        getLogger().info(`Uploaded ${file} → ${url}`);
    }

    return {
        success: true,
        message: `Uploaded ${uploaded.length} files`,
        data: { uploaded },
    };
};
```

### 4. CLI invocation

```bash
# Run a plugin command
jay-stack run media/upload-public

# With extra args passed through to the handler
jay-stack run media/upload-public --folder images --dry-run

# List available commands
jay-stack run --list

# JSON output (default)
jay-stack run stores/sync-catalog

# YAML output
jay-stack run stores/sync-catalog --yaml

# Verbose
jay-stack run media/upload-public -v
```

### 5. Discovery and execution flow

```
jay-stack run media/upload-public --folder images
    │
    ├─ scanPlugins() → find all plugins with `commands` in plugin.yaml
    ├─ Match "media/upload-public" → plugin "wix-media", command "upload-public"
    ├─ createViteForCli() → TypeScript loading
    ├─ initializeServices() → register all plugin services
    ├─ viteServer.ssrLoadModule(pluginModule) → load handler export
    ├─ Parse remaining args: args=[], options={ folder: 'images' }
    │
    ▼
    handler({ pluginName, projectRoot, publicFolder, args, options, services, verbose })
    │
    ├─ Handler uses services, reads files, calls APIs
    ├─ Logs progress via getLogger()
    │
    ▼
    Return { success, message, data }
    │
    ├─ Print result as JSON/YAML
    └─ Exit 0 (success) or 1 (failure)
```

### 6. Argument parsing

The `run` command uses `--` to separate jay-stack options from plugin command arguments:

```bash
jay-stack run -v --yaml media/upload-public -- --folder images --dry-run
```

Everything before `--` (or before the command ref) is parsed by jay-stack. Everything after is passed as raw `args` and `options` to the handler.

In practice, commander's `allowUnknownOption()` + `passThroughOptions` on the `run` command achieves this without requiring `--`.

### 7. `--list` output

```
Available plugin commands:

  wix-media
    upload-public    Upload public folder files to Wix Media
    clear-cache      Clear media CDN cache

  wix-stores
    sync-catalog     Sync product catalog from external CMS
```

## Implementation Plan

### Phase 1: Discovery

**`stack-server-runtime/lib/plugin-commands.ts`** (new):
1. Define `PluginCommandContext`, `PluginCommandResult`, `PluginCommandHandler` types
2. Define `PluginCommandDeclaration` (parsed from plugin.yaml)
3. `discoverPluginCommands({ projectRoot, pluginFilter? })` → returns declared commands with plugin info
4. `executePluginCommand(plugin, command, context)` → loads handler, calls it, returns result

### Phase 2: CLI command

**`stack-cli/lib/run-command.ts`** (new):
1. `runCommand(commandRef, options, projectRoot, initializeServices)` handler
2. Parse `commandRef` as `pluginName/commandName`
3. Discover commands, match, init Vite + services, load handler, execute
4. Print result as JSON/YAML
5. Handle `--list` flag

**`stack-cli/lib/cli.ts`**:
6. Register `run` command with options: `--list`, `--yaml`, `-v`, `--verbose`

### Phase 3: Plugin manifest support

**`stack-server-runtime/lib/plugin-scanner.ts`**:
1. Add `commands` to `PluginManifest` type (optional array)
2. Parse from plugin.yaml during scan

### Phase 4: Documentation

**Agent-kit templates**:
1. Update `plugin/plugin-structure.md` — add `commands` field to plugin.yaml docs
2. Add `plugin/commands-guide.md` — how to write command handlers

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
| Declared in plugin.yaml | Discoverable, documentable | Requires plugin author to declare explicitly |
| Raw args passthrough | Plugins can parse their own args | No type-safe arg declaration in manifest |
| Service injection | Plugins reuse existing service infrastructure | Requires full service initialization even for simple commands |
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
