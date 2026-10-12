# CLAUDE.md

This is a Jay Stack project.

## Getting Started

Run `yarn setup` then `yarn agent-kit` to generate the agent kit.

Read `agent-kit/` for contracts, plugin references, and role guides — this is the authoritative
guidance for the agent kit structure, CLI commands, and project organization.

Before making changes, read `agent-kit/plugins-index.yaml` and the relevant role guide (`agent-kit/designer/`, `agent-kit/developer/`, etc.).

Run `yarn validate` after changes.

## Visual editing (AIditor)

This project includes the AIditor — a visual AI editor at the `/aiditor` route (`yarn dev`). It runs
an agent server-side via the Claude Agent SDK, so it **requires Claude Code installed locally with an
API key**: install the `claude` CLI, then either set `ANTHROPIC_API_KEY` or run `claude login`.
