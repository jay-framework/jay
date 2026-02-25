# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Jay

Jay is an experimental framework solving the design-to-code problem. It establishes a contract between design tools and headless components, enabling designers to build UI in their tools while developers write headless logic. The contract (`.jay-contract` YAML files) is the source of truth for both sides.

## Build & Development Commands

```bash
yarn install              # Install dependencies (Yarn 4.12.0, Node >= 20)
yarn build                # Build all packages (uses wsrun)
yarn build:watch          # Watch mode for all packages
yarn build:check-types    # TypeScript type checking only
yarn test                 # Run all tests (Vitest via wsrun)
yarn confirm              # Full validation: rebuild + type check + test + format
yarn format               # Prettier + fix imports + trailing newlines
yarn clean                # Remove dist directories
yarn reinstall            # Full clean + yarn install + rebuild
```

Run commands from a specific package directory for scoped work. Prefix with `yarn run` if dependency resolution errors occur.

To run a single test file:

```bash
cd packages/<group>/<package>
yarn vitest run test/<test-file>.test.ts
```

## Monorepo Structure

Yarn workspaces with `wsrun` for cross-package commands. All publishable packages are scoped `@jay-framework/`.

### Package Groups

- **`packages/runtime/`** — Client-side libraries

  - `reactive` — Signal/memo/effect reactivity core
  - `component` — Component construction (`makeJayComponent`), hooks (`createSignal`, `createMemo`, `createEffect`, `createEvent`, `provideContext`)
  - `runtime` — DOM manipulation (compiler output target)
  - `secure` — Sandbox isolation for 3rd-party components
  - `json-patch` — RFC 6902 JSON Patch with immutable support
  - `list-compare` — List diffing algorithm
  - `jay-4-react` — React integration
  - `contract-types`, `serialization`, `view-state-merge`, `runtime-automation`

- **`packages/compiler/`** — Build-time tools

  - `compiler` — Core compiler library
  - `compiler-jay-html` — `.jay-html` parsing and code generation
  - `compiler-jay-stack` — Full-stack compilation
  - `compiler-analyze-exported-types` — Type extraction from source
  - `compiler-shared` — Shared utilities (includes `prettifyHtml`)
  - `vite-plugin`, `rollup-plugin` — Bundler integrations
  - `cli` — Command-line tools
  - `typescript-bridge` — TS interop

- **`packages/jay-stack/`** — Full-stack framework

  - `full-stack-component` — `makeJayStackComponent` with three-phase rendering
  - `stack-client-runtime`, `stack-server-runtime` — Client/server runtimes
  - `dev-server` — Development server
  - `editor-server`, `editor-client`, `editor-protocol` — Design tool integration
  - `stack-cli`, `route-scanner`, `plugin-validator`, `logger`

- **`packages/jay-stack-plugins/`** — Plugin implementations (`gemini-agent`, `webmcp`)

## Key Architectural Concepts

### Three-Phase Rendering (Jay Stack)

Components render in three phases, each for different data availability:

1. **Slow** — Build time (SSG), static content
2. **Fast** — Request time (SSR), per-request data
3. **Interactive** — Client-side, reactive updates

### Contract → ViewState + Refs

A `.jay-contract` (YAML) compiles to TypeScript types:

- **ViewState**: Data and variant states the component provides to the view
- **Refs**: Named HTML elements/sub-components the component can interact with

### Component Types

- **Headfull** (jay-html + component): Has both UI and logic
- **Headless** (contract + component): Logic only, UI provided separately
- Both can be client-only (`makeJayComponent`) or full-stack (`makeJayStackComponent`)

### Plugin System

Plugins provide headless components via `plugin.yaml` declaring contracts and actions. `agent-kit` generates discovery indexes.

## Package Layout Convention

Each package follows:

```
lib/          # Source TypeScript
test/         # Tests (mirrors lib/ structure)
test/fixtures/  # External fixture files
dist/         # Build output
```

## Testing Standards

- **Fixture-based**: Store inputs/expected outputs in `test/fixtures/<feature>/` as separate files, not inline
- **Contracts in YAML**: Parse with `parseContract()`, validate with `checkValidationErrors()`
- **Full comparisons**: Use `toEqual` with `prettifyHtml()` for HTML output, not `toContain`
- **Helper functions over beforeEach**: Return elements directly from helpers instead of using side-effect setup
- **One test file per module**: `<module-name>.test.ts`

## Design Log Methodology

Before making significant changes, check `./design-log/` (90+ documents) and `./design-log/index.md`. For new features: create a design log first (Background → Problem → Q&A → Design → Implementation Plan → Examples → Trade-offs), then implement following the plan. Append implementation results to the design log as you go.
