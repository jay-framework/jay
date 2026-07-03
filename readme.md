# Jay

### Guiding AI to guaranteed, production-ready results.

![Jay Logo](docs/media/Jay%20Logo%202.png)

Jay is a self-correcting visual ecosystem for AI-native web development. It bridges the gap between probabilistic AI outputs and deterministic engineering standards through a development-time feedback loop that validates agent actions, promotes smart code reuse, and ensures code is production-ready before deployment.

## The Feedback Loop

![Feedback Loop](docs/media/feedback%20loop.jpeg)

Jay doesn't let AI guess if its code works. The framework automatically validates every output:

1. **AI agents** (Designer, Developer, Plugin Developer) read explicit contracts and instructions to know exactly what to build
2. **Declarative output** — designers generate logic-free templates (`.jay-html`), developers write application logic (`page.ts`), with strict separation between the two
3. **Validation engine** — `jay-stack validate`, tag coverage reports, TypeScript type checking, and plugin validation catch errors immediately
4. **Context-rich feedback** — failures point the agent back to contracts, the plugins index, and agent-kit guides so it can self-correct
5. **Plugins** — inject new capabilities and validation rules, making the loop smarter as the project scales

## AI Agent Roles

![AI Roles](docs/media/AI%20Roles%203.png)

- **AI Designer** — Generates declarative, logic-free visual templates (`.jay-html`) by mapping contract data to UI
- **AI Developer** — Builds full-stack application logic and data flow (`page.ts`) against strict contracts, without writing markup
- **AI Plugin Developer** — Packages reusable business logic and headless components into installable plugins
- **AI DevOps** — Manages deployments via the two-server architecture, pre-compiled builds, and caching infrastructure

## Key Concepts

**Jay** is the minimal client-side runtime (~1,200 lines) — contracts, fine-grained reactivity, and secure sandboxing. **Jay Stack** is the full-stack framework built on top — three-phase rendering, dev server, production builds, and plugins. Most users work with Jay Stack.

### The Contract

At the heart of Jay is the `.jay-contract` — a YAML agreement that decouples design from code. It defines the exact schema of a component: data tags, interactive elements, and variant states.

```yaml
# counter.jay-contract
name: counter
tags:
  - tag: count
    dataType: number
  - tag: adderButton
    type: interactive
    elementType: HTMLButtonElement
  - tag: subtracter
    type: interactive
    elementType: HTMLButtonElement
```

The contract compiles to TypeScript types. The **AI Designer** uses it to build the UI:

```html
<div>
  <button ref="subtracter">-</button>
  <span>{count}</span>
  <button ref="adder-button">+</button>
</div>
```

The **AI Developer** codes against the generated types — no HTML, no CSS:

```typescript
import { render, CounterElementRefs } from './counter.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';

function CounterConstructor({ initialValue }: Props<CounterProps>, refs: CounterElementRefs) {
  const [count, setCount] = createSignal(initialValue);
  refs.subtracter.onclick(() => setCount(count() - 1));
  refs.adderButton.onclick(() => setCount(count() + 1));
  return { render: () => ({ count }) };
}

export const Counter = makeJayComponent(render, CounterConstructor);
```

Either side can iterate independently — the designer can redesign the UI without the developer changing a line of logic.

### Three-Phase Rendering

Jay Stack's full-stack framework renders in three phases for optimal performance:

1. **Slow** (build time / SSG) — static content, pre-rendered at build
2. **Fast** (request time / SSR) — per-request data, server-rendered
3. **Interactive** (client-side) — reactive updates in the browser

```typescript
export const page = makeJayStackComponent<PageContract>()
  .withProps<PageProps>()
  .withSlowlyRender(async (props) => {
    return phaseOutput({ title: 'My Page' }, {});
  })
  .withFastRender(async (props, carryForward) => {
    return phaseOutput({ dynamicData: await fetchData() }, {});
  })
  .withInteractive((props, refs, viewState) => {
    return { render: () => ({ liveCount: count() }) };
  });
```

### Plugins

AI agents favor reusing code over generating logic from scratch. Jay plugins are NPM packages that bundle headless components, server actions, and contracts:

- **Zero-coding integration** — drop complex features (storefronts, auth, CMS) into a page instantly
- **Reduced risk** — inherit performance, security, and SEO from battle-tested packages
- **Zero trust architecture** (in development) — plugin code runs in an isolated sandbox

## Available Plugins

> Current list — more plugins are in development.

### Jay Framework (`packages/plugins/`)

| Plugin | Package | Description |
| --- | --- | --- |
| **ui-kit** | `@jay-framework/ui-kit` | Headless UI components — popover menu, scroll carousel, clipboard copy, word/letter split for text animation |
| **gemini-agent** | `@jay-framework/gemini-agent-plugin` | AI chat agent powered by Gemini with page automation capabilities |
| **webmcp** | `@jay-framework/webmcp-plugin` | Web-based MCP (Model Context Protocol) bridge |
| **a11y-validator** | `@jay-framework/a11y-validator` | Accessibility validation rules for jay-html pages |
| **seo-validator** | `@jay-framework/seo-validator` | SEO validation rules for jay-html pages |

### Wix Plugins ([jay-framework/wix](https://github.com/jay-framework/wix))

| Plugin | Package | Description |
| --- | --- | --- |
| **wix-stores** | `@jay-framework/wix-stores` | Product search, category lists, product spotlight, and dynamic product pages with variant/inventory support |
| **wix-cart** | `@jay-framework/wix-cart` | Shopping cart — cart indicator, full cart page, and mini-cart drawer |
| **wix-members** | `@jay-framework/wix-members` | Authentication — login indicator, OAuth callback, and protected page guard |
| **wix-data** | `@jay-framework/wix-data` | Dynamic CMS contracts generated from Wix Data collection schemas (item, list, table, card) |
| **wix-media** | `@jay-framework/wix-media` | Media optimization validator, upload commands, and media index generation |
| **wix-server-client** | `@jay-framework/wix-server-client` | Core Wix SDK client configuration and API key authentication |
| **wix-deploy** | `@jay-framework/wix-deploy` | Build and deploy commands for Wix-hosted Jay Stack sites |

### AIditor

| Plugin | Package | Description |
| --- | --- | --- |
| **aiditor** | `@jay-framework/aiditor` | Visual AI-driven code editor — page creation, plugin management, asset handling, and one-click publish |

## AI Agent Integration

Jay Stack projects include an agent kit that gives AI coding agents full context about the project's plugins, contracts, and capabilities.

1. Copy [`jay-skill.md`](jay-skill.md) into your agent's skill/instructions folder:

   - **Claude Code**: `mkdir -p ~/.claude/skills/jay && cp jay-skill.md ~/.claude/skills/jay/SKILL.md`
   - **Cursor**: `mkdir -p .cursor/skills/jay && cp jay-skill.md .cursor/skills/jay/SKILL.md`
   - **Windsurf**: add the file path to your agent's context

2. Run setup and agent-kit in your project:
   ```bash
   yarn jay-stack-cli setup
   yarn jay-stack-cli agent-kit
   ```

The skill file teaches the agent how to discover contracts, read the four role guides (designer, developer, plugin, devops), and use the CLI. The agent kit provides the project-specific data.

## Building the Monorepo

```bash
yarn install              # Install dependencies (Yarn 4, Node >= 20)
yarn build                # Build all packages
yarn test                 # Run all tests
yarn confirm              # Full validation: rebuild + type check + test + format
```

## Examples

Example projects are in the `examples/` folder. After `yarn install && yarn build`:

- **Jay** — [counter](examples/jay/counter), [form](examples/jay/form), [todo](examples/jay/todo), [scrum-board](examples/jay/scrum-board), [tree](examples/jay/tree), [mini-benchmark](examples/jay/mini-benchmark)
- **Jay Context** — [scrum-board-with-context](examples/jay-context/scrum-board-with-context), [todo-with-context](examples/jay-context/todo-with-context)
- **Jay Stack** — [fake-shop](examples/jay-stack/fake-shop), [mood-tracker-plugin](examples/jay-stack/mood-tracker-plugin)
- **React** — [mini-benchmark-react](examples/react/mini-benchmark-react) (comparison)

## Monorepo Structure

Yarn workspaces with `wsrun` for cross-package commands. All packages scoped `@jay-framework/`.

| Group         | Path                  | Description                                                                                     |
| ------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| **Runtime**   | `packages/runtime/`   | Client-side libraries — reactivity, components, DOM manipulation, security sandbox              |
| **Compiler**  | `packages/compiler/`  | Build-time tools — jay-html parsing, code generation, Vite/Rollup plugins, CLI                  |
| **Jay Stack** | `packages/jay-stack/` | Full-stack framework — three-phase rendering, dev server, production server, editor integration |
| **Plugins**   | `packages/plugins/`   | Plugin implementations — ui-kit, gemini-agent, webmcp, validators                               |

## Development Setup

Install Node version from [.nvmrc](.nvmrc). Recommended to use [nvm](https://github.com/nvm-sh/nvm).

```bash
npm i -g corepack
corepack enable
yarn install
yarn build
```

For Jay Stack examples, run `yarn dev` from the example directory — you get full hot reload. For client-only Jay examples, use `yarn build:watch` from the monorepo root to rebuild packages on change.

If you get dependency errors when running commands from a package directory, prefix with `yarn run`.

### Before submitting a PR

```bash
yarn confirm    # rebuild + type check + test + format
```

## Design Log

The [design log](design-log/) documents design decisions taken over time. Each entry is true to when it was written — it's not documentation of the current state, but a record of the reasoning behind architectural choices.

## Why Jay?

Jay set out to solve the [design handover problem](design-log/000%20-%20design%20handover%20problem.md). The contract-based solution also addresses [extending UIs with 3rd party components](design-log/001%20-%203rd%20party%20code%20problem.md).
