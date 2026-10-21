# Production Build

## Building

```bash
jay-stack build
jay-stack build --version 2
jay-stack build --no-minify    # debugging
jay-stack build -v             # verbose output
```

Version defaults to the `version` field in `package.json` (e.g., `"1.2.3"` → build version `10203`). Override with `--version`.

## Build Output Structure

The build produces two directories under `build/v{n}/`:

```
build/v{n}/
├── frontend/                        # Browser-facing assets (→ CDN or static serving)
│   ├── shared/                      # Framework + plugin client chunks
│   │   ├── runtime-{hash}.js
│   │   ├── component-{hash}.js
│   │   └── shared-manifest.json
│   ├── pages/                       # Per-page client bundles + CSS
│   │   ├── index/
│   │   │   ├── page-{hash}.js
│   │   │   └── page.css
│   │   └── products/[slug]/
│   │       ├── page_{hash}-{hash}.js
│   │       └── page_{hash}.css
│   └── public/                      # Copied from project ./public
│       └── images/
│           └── logo.png
│
├── backend/                         # Server-only artifacts (→ container)
│   ├── route-manifest.json          # Routes (no instances), action registry
│   ├── build-metadata.json          # Version, timestamp, instance count
│   ├── server/                      # Compiled server code
│   │   ├── init.js
│   │   ├── pages/{route}/page.js
│   │   ├── components/{name}/{name}.js
│   │   ├── plugins/{name}/{name}.js
│   │   └── actions/{name}.actions.js
│   └── pre-rendered/                # SSR artifacts per instance
│       └── {route}/
│           ├── page.jay-html            # Pre-rendered HTML template
│           ├── page.cache.json          # Slow ViewState + carryForward
│           ├── page.server-element.js   # Streaming SSR module
│           └── page-parts.json          # Component wiring config
```

## Frontend vs Backend

| Directory   | Contains                                                                   | Deploy to                 |
| ----------- | -------------------------------------------------------------------------- | ------------------------- |
| `frontend/` | JS bundles, CSS, images — everything the browser loads                     | CDN or static file server |
| `backend/`  | Server modules, pre-rendered HTML, manifests — everything the server reads | Container / server        |

The build is **environment-agnostic**. The same output serves any deployment mode. `staticBaseUrl` (where browser assets are hosted) is a serve-time parameter, not baked into the build.

## Manifest

`backend/route-manifest.json` contains:

- **routes** — pattern, segments, server module path, route-level `serverElementPath`, `routeClientBundlePath` and `routeCssPath`. The manifest holds **routes only** — it does not list instances.
- **actions** — server module paths, action names
- **sharedManifest** — maps package names to hashed filenames in `frontend/shared/`

## Instances

An instance (one set of route params) is identified by its data file, `backend/pre-rendered/{route}/page[_{hash}].cache.json`. The path is derived from the route pattern and the params (`_` + first 8 hex of the md5 of the sorted-params JSON), and the file carries `route`, `params` and the freshness fields (`renderedAt`, `ttl`, `grace`) itself — it is its own index entry.

The `ArtifactStore` lists a route's instances (sitemap, llms.txt, rebuild) from those files, so new instances created after the build — by [render-on-miss](serving-modes.md#fresh-data-and-new-items) or a rebuild — appear without touching the manifest.

## Project Structure Requirements

For production builds to work correctly:

- **Full-stack components** (headless) must be in `src/components/` (not inside page directories)
- **Headless plugins** must be in `src/plugins/`
- **Actions** must be in `src/actions/` with `*.actions.ts` naming
- **Init** must be at `src/init.ts`

The build discovers server-side modules from `src/pages/`, `src/components/`, `src/plugins/`, and `src/actions/`. Files outside these directories are not compiled for server use.
