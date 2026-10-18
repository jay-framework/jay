# Jay Stack DevOps — Agent Kit

This folder contains guides for building, deploying, and operating jay-stack projects in production.

## What Does the DevOps Role Do?

The devops role handles the production lifecycle: building artifacts, configuring deployment environments, serving in different modes (self-hosted, CDN, BaaS), and managing content invalidation. This is distinct from the developer role (creates page logic), designer role (creates UI), and plugin role (creates headless components).

## Workflow

1. **Build** — `jay-stack build` to compile all pages into production artifacts
2. **Deploy** — upload `frontend/` to CDN, deploy `backend/` to server container. Plugins can provide deploy commands via `jay-stack run <plugin>/deploy`
3. **Serve** — start the production server with environment-appropriate flags
4. **Invalidate** — rebuild specific pages when data changes
5. **Admin** — run plugin CLI commands via `jay-stack run <plugin>/<command>` (media upload, data sync, cache purge)

## Plugin Setup

Plugins may need credentials or configuration before they can run. The setup command handles this.

```bash
# Default (non-interactive) — exits with structured output if input is needed
jay-stack-cli setup

# Interactive — prompts for credentials via terminal
jay-stack-cli setup --interactive

# With pre-provided answers (for automation)
jay-stack-cli setup --answers answers.yaml
```

### Automated setup (CI / agents)

When running `jay-stack-cli setup` without `--interactive`, plugins that need user input will exit with structured YAML output:

```yaml
setup-needs-answer:
  plugin: '@jay-framework/some-plugin'
  key: apiKey
  type: input
  message: 'Enter your API key'
  choices: # present only for select-type questions
    - us: United States
```

To provide the answer, create a YAML file keyed by the `key` field and re-run:

```yaml
# answers.yaml
apiKey: 'your-answer'
```

```bash
jay-stack-cli setup --answers answers.yaml
```

Repeat until all plugins report `configured`. The flow is iterative — each run may reveal the next question. The `key` is the stable join field between a question and its answer.

> **Exception — Wix login is not answerable via a file.** The Wix plugins' credential setup shells out to the Wix CLI for a browser-based OAuth login (`npx @wix/cli login`). In non-interactive mode it reports `needs-config` ("requires interactive mode") rather than a `setup-needs-answer:` — there is no key you can put in `answers.yaml`. A human must run `jay-stack-cli setup --interactive` in a real terminal once; after that the app secret, client ID, and site ID are fetched/derived automatically. `wix-deploy` also needs a live Wix CLI session at deploy time (`jay-stack run wix-deploy/deploy`) — re-run `npx @wix/cli login` if it reports the session is missing.

### Setup order

Run setup **before** agent-kit and build:

```bash
jay-stack-cli setup              # 1. Configure plugins
jay-stack-cli agent-kit          # 2. Generate contracts and discovery data
jay-stack-cli build              # 3. Production build
```

## Running in cloud / remote environments

Running the dev server behind a cloud preview proxy (sandboxes, Codespaces, Gitpod, etc.) has three
non-obvious requirements.

### 1. Allow the proxy's host (Vite host check)

The dev server runs Vite in middleware mode, and Vite's host check 403s any request whose `Host` header
isn't `localhost` ("Blocked request. This host is not allowed."). Allow the external host via `.jay`:

```yaml
# .jay
devServer:
  allowedHosts:
    - .mysandbox.dev # Vite host-suffix syntax — matches any subdomain
  # or, to disable the check entirely (dev only):
  # allowedHosts: true
```

Platforms that already set Vite's `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` env var (comma-separated
hosts, or `true`) need **no** `.jay` change — the dev server reads and merges it. Do **not** add a
`src/pages/vite.config.ts` to work around this; use the config above (DL#220).

> HMR over a proxy may additionally need Vite's `server.hmr` client settings — not required for serving
> pages, only for live reload through the proxy.

### 2. Binding and port

`jay-stack-cli dev` takes **no** `--port` / `--host` flags. The Express server binds all interfaces, so
the container is reachable as-is; set the port in `.jay` (`devServer.portRange`, e.g. `[3000, 3000]` to
pin it).

### 3. Credentials are read from files, not env vars

Plugins read credentials from files written by `setup`, not from `process.env`. Wix, for example, uses
`config/.wix.yaml` (backend services) and `wix.config.json` (deploy target) — both gitignored. A
container that only has secrets as env vars must **materialize them into those files before** starting
the dev server (e.g. a startup script that writes `config/.wix.yaml` from `WIX_*` env vars). Putting
`WIX_*` under a compose `environment:` block does **not** configure the plugins.

### 4. AIditor (visual editor) in a container

The `/aiditor` route runs an agent **server-side** via the Claude Agent SDK, so the environment running
the dev server — not the user's laptop — must have Claude Code available:

- **Install the `claude` CLI in the image.** It is not part of the Node base image.
- **Provide `ANTHROPIC_API_KEY` as a secret/env var.** `claude login` is interactive and cannot complete
  headless, so in a container the API key is the only viable auth. (Locally, `claude login` also works.)
- **It's dev-only.** The `/aiditor` route is served by the dev server; it is excluded from production
  deploy (`--exclude-plugins aiditor`). If you don't need visual editing in a given environment, you can
  ignore it — the rest of the site scaffolds, builds, runs, and deploys without it; only the `/aiditor`
  route's agent stays inert when the CLI/key are absent.

A cloud platform that boots the dev server but neither installs the CLI nor injects the key will serve a
working site with a non-functional `/aiditor` — the single most common surprise. Install both, or
document that visual editing is unavailable there.

### Health / shutdown (containers)

Run with `--test-mode` to expose `GET /_jay/health` (readiness probe) and `POST /_jay/shutdown` (graceful
stop) — the sanctioned hooks for container healthchecks and lifecycle, instead of signal-guessing.

## Guides

| File                                       | Topic                                                       |
| ------------------------------------------ | ----------------------------------------------------------- |
| [production-build.md](production-build.md) | Build pipeline, output structure, frontend/backend split    |
| [serving-modes.md](serving-modes.md)       | Self-hosted, CDN, BaaS (fetch handler), CLI flags           |
| [fetch-handler.md](fetch-handler.md)       | Fetch handler, ArtifactStore interface, BaaS custom stores  |
| [invalidation.md](invalidation.md)         | Rebuild, renderer server, cleanup                           |
| [source-editing.md](source-editing.md)     | Enable + use the source-editing inspector (AIditor, DL#219) |
