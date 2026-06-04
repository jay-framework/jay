# Jay Stack DevOps — Agent Kit

This folder contains guides for building, deploying, and operating jay-stack projects in production.

## What Does the DevOps Role Do?

The devops role handles the production lifecycle: building artifacts, configuring deployment environments, serving in different modes (self-hosted, CDN, BaaS), and managing content invalidation. This is distinct from the developer role (creates page logic), designer role (creates UI), and plugin role (creates headless components).

## Workflow

1. **Build** — `jay-stack build` to compile all pages into production artifacts
2. **Deploy** — upload `frontend/` to CDN, deploy `backend/` to server container
3. **Serve** — start the production server with environment-appropriate flags
4. **Invalidate** — rebuild specific pages when data changes

## Guides

| File                                       | Topic                                                    |
| ------------------------------------------ | -------------------------------------------------------- |
| [production-build.md](production-build.md) | Build pipeline, output structure, frontend/backend split |
| [serving-modes.md](serving-modes.md)       | Self-hosted, CDN, BaaS (fetch handler), CLI flags        |
| [fetch-handler.md](fetch-handler.md)       | @jay-framework/jay-fetch-handler for BaaS integration    |
| [invalidation.md](invalidation.md)         | Rebuild, renderer server, cleanup                        |
