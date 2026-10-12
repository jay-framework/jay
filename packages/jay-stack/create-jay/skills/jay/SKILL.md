---
name: jay
description: Create a new Jay Stack project from scratch — the preconditions to check first and the scaffolding command that generates a working project. Hands off to the in-project CLAUDE.md and agent-kit for actually building pages, components, and plugins.
---

# Create a new Jay project

A short, ordered playbook for scaffolding a brand-new Jay Stack project. Use it when there is **no Jay
project yet** and you need to bootstrap one.

**Scope — bootstrapping only.** This skill gets a project onto disk and running. It does **not** teach
how to build pages, components, contracts, or plugins — that guidance ships _inside_ the scaffolded
project as `CLAUDE.md` plus the generated `agent-kit/` (designer / developer / plugin / devops role
guides). After scaffolding, read those.

## 0 · Preconditions (check before scaffolding)

- **Node ≥ 20** — `node --version`. The scaffolder and CLI require it.
- **A package manager** — npm (bundled with Node) or Yarn. `npm create jay` auto-detects which one
  invoked it and uses it for install.
- **For the AIditor (visual AI editor, included by default): Claude Code installed locally + an API
  key.** The project ships with `@jay-framework/aiditor`, whose `/aiditor` route runs an agent
  server-side via the Claude Agent SDK. Its authentication matches Claude Code: install the `claude`
  CLI, then either set `ANTHROPIC_API_KEY` in the environment **or** run `claude login`. Without this
  the project still scaffolds, builds, and runs — only the `/aiditor` route's agent won't run.

## 1 · Scaffold the project

**Interactive** (prompts for a project name and a plugin selection):

```bash
npm create jay@latest
# or:  yarn create jay
# or:  npx create-jay
```

- **Project name** — lowercase letters, numbers, and hyphens; must start and end with a letter or
  number; at least 3 characters (e.g. `my-store`).
- **Plugins** — a checklist (UI Kit, validators, Wix Stores/Members/Media/Data, etc.). Defaults are
  pre-checked; accept them or adjust.

**Non-interactive** (CI / scripted — pass a name and an explicit, possibly empty, plugin list):

```bash
# a few plugins by package name (comma-separated):
npm create jay@latest -- --name my-store --plugins "@jay-framework/ui-kit,@jay-framework/wix-stores"

# no optional plugins:
npm create jay@latest -- --name my-site --plugins ""
```

The scaffolder then, in order: creates `./<name>/`, installs dependencies, generates the agent-kit
(`npx jay-stack-cli agent-kit`), and runs plugin setup (`npx jay-stack-cli setup`). A step that can't
complete non-interactively (e.g. a plugin needing credentials) is skipped with a note and can be re-run
later with `yarn setup`.

## 2 · What you get

```
my-store/
  src/
    pages/            # file-system routing — starts with a home page
      page.jay-html
      page.ts
      page.jay-contract
    styles/theme.css
  .jay                # project + plugin configuration
  CLAUDE.md           # in-project agent guidance — read this next
  agent-kit/          # generated role guides + contract/plugin references
  package.json        # scripts: dev, setup, agent-kit, validate, build, serve
```

## 3 · First run

```bash
cd my-store
yarn dev            # or: npm run dev   → dev server (and the /aiditor route)
```

If plugin setup was skipped (missing credentials) run `yarn setup` to configure API keys, then
`yarn agent-kit` to refresh generated references.

## 4 · Hand-off — build inside the project

Scaffolding is done. To actually build the site, switch to the in-project guidance:

1. Read `CLAUDE.md` at the project root.
2. Read `agent-kit/plugins-index.yaml` to see what plugins and contracts are available.
3. Read the role guide that matches your task under `agent-kit/` — `designer/` (jay-html pages,
   styling), `developer/` (`page.ts`, services, routing), `plugin/` (headless components, actions),
   `devops/` (build, deploy, serve).

Run `yarn validate` after changes.
