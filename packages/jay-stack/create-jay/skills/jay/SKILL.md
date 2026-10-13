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
- **For any Wix plugin (`wix-stores` / `wix-members` / `wix-media` / `wix-data` / `wix-deploy`): a Wix
  account + a browser login.** All Wix plugins share one credential owner,
  `@jay-framework/wix-server-client`, which is pulled in automatically when you select any `wix-*`
  plugin. Its setup is **interactive** — during `setup` it shells out to the Wix CLI
  (`npx @wix/cli login`, opening a browser for OAuth) and, if the project isn't connected to a site yet,
  runs `npm create @wix/new init` to connect one. From there it fetches the app secret and writes
  `config/.wix.yaml` for you — you are **not** prompted for an API key, site ID, or client ID (those are
  derived or fetched). Notes:
  - This step **requires interactive mode.** In non-interactive / CI runs it is skipped with a
    `needs-config` note; re-run `yarn setup` in a terminal to complete it.
  - **`wix-deploy` additionally needs a live Wix login at deploy time** (`yarn wix:deploy`) — it uses
    the Wix CLI session in `~/.wix`. If that session is missing it errors with "Run `wix login` first";
    just run `npx @wix/cli login` again.
  - **API key is optional / manual.** The default flow uses the auto-fetched app secret; only hand-edit
    an `apiKey` into `config/.wix.yaml` if you deliberately choose the API-key strategy.

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

### Completing setup non-interactively (agents / CI)

`jay-stack-cli setup` has three input modes:

- `--interactive` — prompts a human in the terminal.
- `--answers <file>` — reads answers from a YAML file (for agents).
- _(neither)_ — surfaces every needed answer instead of prompting.

When a plugin needs a value it can't get, setup does **not** hang or guess — it prints a structured,
machine-readable block and exits that plugin:

```
setup-needs-answer:
  plugin: @jay-framework/some-plugin
  key: apiKey
  type: input
  message: "Enter your API key"
  choices:          # only present for select-type questions
    - us: United States
```

**The loop for an agent:** run `yarn setup` → for each `setup-needs-answer:` block, add a line
`<key>: "<value>"` to an `answers.yaml` → re-run `jay-stack-cli setup --answers answers.yaml`. Any value
still missing surfaces again as another `setup-needs-answer:`; repeat until none remain. The `key` is the
stable join field between the question and your answer.

**Exception — Wix login is not answerable via file.** The Wix plugins' credential setup shells out to
the Wix CLI for a browser-based OAuth login (`npx @wix/cli login`). In non-interactive mode it returns a
`needs-config` note ("requires interactive mode"), **not** a `setup-needs-answer:` — there is no key you
can put in `answers.yaml` for it. A human must run `yarn setup` in a real terminal once to complete the
Wix login; everything else (app secret, client ID, site ID) is fetched/derived automatically after that.

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
