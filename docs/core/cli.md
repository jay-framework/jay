# CLI Reference

Jay provides two command-line tools: `jay-stack` for full-stack development and `jay-cli` for compilation and type generation.

## jay-stack

The Jay Stack CLI manages development servers, validation, and plugin tooling.

```bash
jay-stack <command> [options]
```

### `jay-stack dev`

Start the Jay Stack development server.

```bash
jay-stack dev [path]
```

| Option                | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `-v, --verbose`       | Enable verbose logging output                            |
| `-q, --quiet`         | Suppress all non-error output                            |
| `--test-mode`         | Enable test endpoints (`/_jay/health`, `/_jay/shutdown`) |
| `--timeout <seconds>` | Auto-shutdown after N seconds (implies `--test-mode`)    |

The dev server compiles Jay-HTML, runs the three-phase render pipeline (slow/fast/interactive), and serves the result with hot module replacement via Vite.

**Test mode** exposes health and shutdown endpoints for CI and automated testing:

```bash
# Start with test mode
jay-stack dev --test-mode

# Start with auto-timeout (useful in CI)
jay-stack dev --timeout 60
```

See [Testing](./testing.md) for details on test mode and smoke tests.

### `jay-stack validate`

Validate all `.jay-html` and `.jay-contract` files in a project.

```bash
jay-stack validate [path]
```

| Option          | Description                     |
| --------------- | ------------------------------- |
| `-v, --verbose` | Show per-file validation status |
| `--json`        | Output results as JSON          |

Exits with code 1 if validation fails. Useful for CI pipelines.

### `jay-stack validate-plugin`

Validate a Jay Stack plugin package.

```bash
jay-stack validate-plugin [path]
```

| Option             | Description                              |
| ------------------ | ---------------------------------------- |
| `--local`          | Validate local plugins in `src/plugins/` |
| `-v, --verbose`    | Show detailed validation output          |
| `--strict`         | Treat warnings as errors (for CI)        |
| `--generate-types` | Generate `.d.ts` files for contracts     |

See [Building Jay Packages](./building-jay-packages.md) for plugin development.

### `jay-stack agent-kit`

Materialize contracts and prepare the agent kit for AI-assisted development.

```bash
jay-stack agent-kit
```

| Option               | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `-o, --output <dir>` | Output directory (default: `agent-kit/materialized-contracts`) |
| `--yaml`             | Output contract index as YAML to stdout                        |
| `--list`             | List contracts without writing files                           |
| `--plugin <name>`    | Filter to a specific plugin                                    |
| `--dynamic-only`     | Only process dynamic contracts                                 |
| `--force`            | Force re-materialization                                       |
| `-v, --verbose`      | Show detailed output                                           |

Creates `agent-kit/INSTRUCTIONS.md` if it doesn't exist. This provides AI agents with the contract information needed to work with your project.

### `jay-stack action`

Run a plugin action from the command line. Used for agent discovery of valid prop values.

```bash
jay-stack action <plugin/action> [options]
```

| Option           | Description                               |
| ---------------- | ----------------------------------------- |
| `--input <json>` | JSON input for the action (default: `{}`) |
| `--yaml`         | Output result as YAML instead of JSON     |
| `-v, --verbose`  | Show detailed output                      |

**Example:**

```bash
jay-stack action wix-stores/searchProducts --input '{"query":"laptop"}'
```

### `jay-stack params`

Discover load param values for a contract. Useful for finding valid page parameters.

```bash
jay-stack params <plugin/contract> [options]
```

| Option          | Description                           |
| --------------- | ------------------------------------- |
| `--yaml`        | Output result as YAML instead of JSON |
| `-v, --verbose` | Show detailed output                  |

**Example:**

```bash
jay-stack params wix-stores/product-page
```

---

## jay-cli

The Jay CLI handles compilation and type generation for `.jay-html` and `.jay-contract` files.

```bash
jay-cli <command> [options]
```

### `jay-cli definitions`

Generate TypeScript definition files (`.d.ts`) for `.jay-html` and `.jay-contract` files. The `.d.ts` files are placed alongside the source files.

```bash
jay-cli definitions <source>
```

| Argument   | Description                                                     |
| ---------- | --------------------------------------------------------------- |
| `<source>` | Source folder to scan for `.jay-html` and `.jay-contract` files |

This is typically run as part of a build script:

```json
{
  "scripts": {
    "definitions": "jay-cli definitions src"
  }
}
```

### `jay-cli runtime`

Generate runtime code files (`.ts`) for `.jay-html` files. Normally the Vite plugin handles this automatically during development, but this command allows explicit generation.

```bash
jay-cli runtime <source> [destination] [compilationTarget]
```

| Argument              | Description                                     |
| --------------------- | ----------------------------------------------- |
| `<source>`            | Source folder to scan for `.jay-html` files     |
| `[destination]`       | Output folder (default: alongside source files) |
| `[compilationTarget]` | Target runtime: `jay` (default) or `react`      |

---

## Common Workflows

### Development

```bash
# Start dev server
jay-stack dev

# Start with verbose logging
jay-stack dev -v
```

### CI / Testing

```bash
# Validate the project
jay-stack validate --json

# Validate plugins with strict mode
jay-stack validate-plugin --strict

# Run dev server with timeout for smoke tests
jay-stack dev --timeout 60
```

### Type Generation

```bash
# Generate .d.ts files for all jay-html and contracts
jay-cli definitions src
```

### Agent / AI Tooling

```bash
# Prepare agent kit
jay-stack agent-kit

# List available contracts
jay-stack agent-kit --list

# Run a plugin action
jay-stack action wix-stores/searchProducts --input '{"query":""}'
```
