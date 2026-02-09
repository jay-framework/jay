# CLI Commands Reference

## jay-stack setup

Run plugin setup. Plugins can create configuration files, generate reference data, and validate their prerequisites.

```bash
# Run setup for all installed plugins
jay-stack setup

# Run setup for a specific plugin
jay-stack setup wix-stores

# Re-run setup (e.g., after config change)
jay-stack setup wix-data --force
```

Plugins declare their setup handler in `plugin.yaml`. Setup typically writes config files to the `config/` folder. Run this after installing new plugins, before `jay-stack agent-kit`.

## jay-stack agent-kit

Materialize contracts and generate discovery indexes. Run this after setup.

```bash
# Default: writes to agent-kit/materialized-contracts/
jay-stack agent-kit

# Custom output directory
jay-stack agent-kit --output my-output/

# List contracts without writing files
jay-stack agent-kit --list

# Filter to specific plugin
jay-stack agent-kit --plugin wix-stores

# Force re-materialization
jay-stack agent-kit --force
```

Outputs:
- `materialized-contracts/contracts-index.yaml`
- `materialized-contracts/plugins-index.yaml`
- `materialized-contracts/<plugin>/*.jay-contract` (dynamic contracts)
- Documentation files (INSTRUCTIONS.md and references)

## jay-stack validate

Validate all `.jay-html` and `.jay-contract` files.

```bash
# Validate entire project
jay-stack validate

# Validate a specific path
jay-stack validate src/pages/products/

# Verbose (per-file status)
jay-stack validate -v

# JSON output
jay-stack validate --json
```

Example output:

```
✅ Jay Stack validation successful!
Scanned 5 .jay-html files, 3 .jay-contract files
No errors found.
```

On failure:

```
❌ Jay Stack validation failed

Errors:
  ❌ src/pages/products/page.jay-html
     Unknown ref "nonExistentRef" - not found in contract

1 error(s) found, 7 file(s) valid.
```

Always run validate after creating or editing jay-html and contract files.

## jay-stack params

Discover load param values for SSG route generation.

```bash
# Discover slug values for product pages
jay-stack params wix-stores/product-page

# YAML output
jay-stack params wix-stores/product-page --yaml

# Verbose
jay-stack params wix-stores/product-page -v
```

Format: `<plugin-name>/<contract-name>`

Example output:

```json
[
  { "slug": "ceramic-flower-vase" },
  { "slug": "blue-running-shoes" },
  { "slug": "organic-cotton-tshirt" }
]

✅ Found 3 param combination(s)
```

Use this to discover what param values exist for dynamic routes like `[slug]`. Only works on contracts whose component has `loadParams`.

## jay-stack action

Run a plugin action from the CLI. Use to discover data for populating pages.

```bash
# Run with default input
jay-stack action wix-stores/searchProducts

# Run with input
jay-stack action wix-stores/searchProducts --input '{"query": "shoes", "limit": 5}'

# YAML output
jay-stack action wix-stores/getCategories --yaml

# Verbose
jay-stack action wix-stores/getProductBySlug --input '{"slug": "blue-shirt"}' -v
```

Format: `<plugin-name>/<action-name>`

Action names are listed in the plugin's `plugin.yaml` under `actions:`.

Example output:

```json
{
  "items": [
    { "_id": "prod-1", "name": "Blue Shirt", "slug": "blue-shirt", "price": 29.99 },
    { "_id": "prod-2", "name": "Red Hat", "slug": "red-hat", "price": 19.99 }
  ],
  "totalCount": 2
}
```

If not found, lists available actions:

```
❌ Action "badName" not found.
   Available actions: searchProducts, getProductBySlug, getCategories
```

## jay-stack dev

Start the development server.

```bash
# Normal dev mode
jay-stack dev

# Test mode (enables health/shutdown endpoints)
jay-stack dev --test-mode

# Auto-timeout (implies test mode)
jay-stack dev --timeout 60
```

### Test mode endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/_jay/health` | GET | `{"status":"ready","port":3300,"editorPort":3301,"uptime":5.2}` |
| `/_jay/shutdown` | POST | `{"status":"shutting_down"}` |

### Wait for server ready

Poll the health endpoint:

```bash
# Bash
for i in {1..30}; do
  curl -s http://localhost:3300/_jay/health | grep -q "ready" && break
  sleep 1
done
```

```typescript
// TypeScript
async function waitForServer(timeout = 30000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const res = await fetch('http://localhost:3300/_jay/health');
            if (res.ok) {
                const { port } = await res.json();
                return `http://localhost:${port}`;
            }
        } catch { /* not ready */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Server not ready');
}
```

### Shutdown

```bash
curl -X POST http://localhost:3300/_jay/shutdown
```
