# Invalidation & Rebuild

## When to Rebuild

Page instances are pre-rendered at build time with slow-phase data. When that data changes (product updated, content edited), the affected instances need to be rebuilt without a full build.

## jay-stack rebuild

Three targeting modes:

```bash
# By contract — rebuild all routes using this contract
jay-stack rebuild --contract product-page

# By route — rebuild all instances of a route pattern
jay-stack rebuild --route /products/[slug]

# By URL — resolve to route+params, rebuild that one instance
jay-stack rebuild --url /products/blue-widget
```

Narrow it down with `--params`:

```bash
# Rebuild one specific instance
jay-stack rebuild --contract product-page --params '{"slug":"blue-widget"}'
jay-stack rebuild --route /products/[slug] --params '{"slug":"blue-widget"}'
```

### How it works

1. Reads the route manifest to find affected routes/instances
2. Re-runs slow render with fresh data
3. Re-compiles server element and client bundle
4. Updates the instance entry in the manifest
5. Touches `build-metadata.json` to trigger main server manifest reload
6. Old files are tracked in `cleanup-manifest.json` for later cleanup

### Cleanup

After rebuilds, orphaned files (old client bundles, old server elements) accumulate. Clean them up:

```bash
jay-stack cleanup
```

## Renderer Server

For automated invalidation, run the renderer server alongside the main server:

```bash
# Main server — pages and actions
jay-stack serve --role main --port 4000

# Renderer server — listens for webhooks, triggers rebuilds
jay-stack serve --role renderer --port 4001
```

The renderer server:

- Listens for data change webhooks from external systems (CMS, e-commerce)
- Determines which routes are affected (via contract name → route resolution)
- Runs `rebuild` for each affected instance
- The main server detects the updated `build-metadata.json` and reloads the manifest

### Contract-based resolution

The manifest tracks which contracts each route uses. When a webhook says "product-page data changed", the renderer finds all routes that use the `product-page` contract and rebuilds their instances.

## Build Output After Rebuild

Rebuilt instances write new files to both `frontend/` and `backend/`:

- `backend/pre-rendered/` — updated jay-html, cache, server element
- `frontend/pages/` — updated client bundle, CSS

Old files are not deleted immediately — they're tracked in `cleanup-manifest.json`. This avoids breaking in-flight requests that still reference old bundles.
