# CLI Commands

Plugins can expose CLI commands for admin and batch operations. Run via `jay-stack run <plugin>/<command>`.

## When to Use

- Media upload (public folder → cloud storage)
- Data sync (external CMS → local references)
- Deployment (build artifacts → cloud provider)
- Cache management (CDN purge, rebuild triggers)

For request-response operations, use [actions](actions-guide.md) instead.

## Creating a Command

### 1. Build the handler

```typescript
import { makeCliCommand, CONSOLE_CONTEXT } from '@jay-framework/fullstack-component';
import { MEDIA_SERVICE } from './services';

export const uploadPublic = makeCliCommand('upload-public')
  .withServices(MEDIA_SERVICE, CONSOLE_CONTEXT)
  .withHandler(async (input: { folder?: string; dryRun?: boolean }, mediaService, console) => {
    const path = await import('node:path');
    const fs = await import('node:fs/promises');

    const dir = path.resolve(console.publicFolder, input.folder || '');
    const files = await fs.readdir(dir, { recursive: true });

    for (const file of files) {
      const filePath = path.join(dir, String(file));
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;

      if (input.dryRun) {
        console.log(`[dry-run] Would upload ${file}`);
        continue;
      }

      const url = await mediaService.upload(filePath);
      console.log(`Uploaded ${file} → ${url}`);
    }

    return { success: true };
  });
```

### 2. Create the metadata file

Place `.jay-command` files in a `commands/` folder (alongside `contracts/` and `actions/`):

```yaml
# commands/upload-public.jay-command
name: upload-public
description: Upload public folder files to cloud storage

inputSchema:
  folder?: string
  dryRun?: boolean
```

The `inputSchema` auto-generates CLI flags:

- `folder?: string` → `--folder <value>` (optional)
- `dryRun?: boolean` → `--dry-run` (optional flag)

Required fields (no `?`) are validated before the handler runs.

### 3. Declare in plugin.yaml

```yaml
commands:
  - name: upload-public
    command: commands/upload-public.jay-command
```

## `CONSOLE_CONTEXT` Service

A framework-provided service with project info and a logger:

```typescript
interface ConsoleContext {
  projectRoot: string;
  publicFolder: string;
  build: {
    frontend: string; // Build output: JS, CSS, public assets
    backend: string; // Build output: server modules, pre-rendered HTML
  };
  verbose: boolean;
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}
```

Request it via `.withServices(CONSOLE_CONTEXT)`. Commands that don't need it simply don't request it.

## Running Commands

```bash
# Run a command
jay-stack run media/upload-public --folder images --dry-run

# List all available commands
jay-stack run --list

# Verbose output
jay-stack run media/upload-public -v
```

## Input Type Mapping

| Schema type       | CLI flag                            | Example            |
| ----------------- | ----------------------------------- | ------------------ |
| `field: string`   | `--field <value>` (required)        | `--env production` |
| `field?: string`  | `--field <value>` (optional)        | `--folder images`  |
| `field?: boolean` | `--field` (optional flag)           | `--dry-run`        |
| `field: number`   | `--field <value>` (required number) | `--concurrency 4`  |

camelCase names become kebab-case flags: `dryRun` → `--dry-run`.
