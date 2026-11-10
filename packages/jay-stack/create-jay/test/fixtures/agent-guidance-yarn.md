# CLAUDE.md

This is a Jay Stack project.

## Getting Started

Run `yarn setup` then `yarn agent-kit` to generate the agent kit.

### Plugin setup (credentials)

`yarn setup` configures each installed plugin. For agents/CI it is non-interactive: a plugin that needs
a value exits with a structured `setup-needs-answer:` block (`plugin`/`key`/`type`/`message`/`choices`).
Put each `<key>: "<value>"` into `answers.yaml` and re-run `jay-stack-cli setup --answers answers.yaml`;
repeat until every plugin reports `configured`. See `agent-kit/devops/INSTRUCTIONS.md` for the full loop.

**Wix plugins are the exception:** their login is a browser OAuth via the Wix CLI, so it can't be
answered from a file — run `yarn setup` once in a real terminal to complete it. Everything else (app
secret, client ID, site ID) is fetched automatically afterward.

Read `agent-kit/` for contracts, plugin references, and role guides — this is the authoritative
guidance for the agent kit structure, CLI commands, and project organization.

Before making changes, read `agent-kit/plugins-index.yaml` and the relevant role guide (`agent-kit/designer/`, `agent-kit/developer/`, etc.).

Run `yarn validate` after changes.

## Visual editing (AIditor)

This project includes the AIditor — a visual AI editor at the `/aiditor` route (`yarn dev`). It runs
an agent server-side via the Claude Agent SDK, so it **requires Claude Code installed locally with an
API key**: install the `claude` CLI, then either set `ANTHROPIC_API_KEY` or run `claude login`.
