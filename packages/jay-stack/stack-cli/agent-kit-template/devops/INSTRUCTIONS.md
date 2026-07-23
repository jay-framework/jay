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
  plugin: wix-server-client
  key: api-key
  type: input
  message: 'Enter your API key'
```

To provide the answer, create a YAML file and re-run:

```yaml
# answers.yaml
api-key: 'IST.abc123...'
```

```bash
jay-stack-cli setup --answers answers.yaml
```

Repeat until all plugins report `configured`. The flow is iterative — each run may reveal the next question.

### Setup order

Run setup **before** agent-kit and build:

```bash
jay-stack-cli setup              # 1. Configure plugins
jay-stack-cli agent-kit          # 2. Generate contracts and discovery data
jay-stack-cli build              # 3. Production build
```

## Guides

| File                                       | Topic                                                      |
| ------------------------------------------ | ---------------------------------------------------------- |
| [production-build.md](production-build.md) | Build pipeline, output structure, frontend/backend split   |
| [serving-modes.md](serving-modes.md)       | Self-hosted, CDN, BaaS (fetch handler), CLI flags          |
| [fetch-handler.md](fetch-handler.md)       | Fetch handler, ArtifactStore interface, BaaS custom stores |
| [invalidation.md](invalidation.md)         | Rebuild, renderer server, cleanup                          |
