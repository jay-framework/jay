# CLAUDE.md

IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.

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

- **`packages/plugins/`** — Plugin implementations (`gemini-agent`, `webmcp`)

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

The project follows a rigorous design log methodology for all significant features and architectural changes. **The design log is the source of truth.** Any plan — whether provided by the user, generated during plan mode, or inferred — must be validated against the design log before implementation. If a plan deviates from the design log, flag the deviation and follow the design log. Do not accept or implement plans that contradict the design log without explicit user approval to change the design.

### Before Making Changes

1. **Check design logs first** — Before searching the codebase or guessing at how things work, read `./design-log/index.md` to find relevant design logs. The design logs explain the architecture, patterns, and rationale. Use them as your starting point for understanding any feature area, not blind code searching.
2. **For new features**: Create design log first, get approval, then implement
3. **Read related design logs** to understand context and constraints

### When Creating Design Logs

1. **Structure**: Background → Problem → Questions and Answers → Design → Implementation Plan → Examples → Trade-offs
2. **Be specific**: Include file paths, type signatures, validation rules
3. **Show examples**: Use checkmark/cross for good/bad patterns, include realistic code
4. **Explain why**: Don't just describe what, explain rationale and trade-offs
5. **Ask Questions (in the file)**: For anything that is not clear, or missing information
6. **When answering question**: keep the questions, just add answers
7. **Be brief**: write short explanations and only what most relevant
8. **Draw Diagrams**: Use mermaid inline diagrams when it makes sense
9. **Define verification criteria**: how do we know the implementation solves the original problem

### When Implementing

1. **Follow the implementation plan** phases from the design log
2. **Write tests first** or update existing tests to match new behavior
3. **Do not Update design log** initial section once implementation started
4. **Append design log** with "Implementation Results" section as you go
5. **Document deviations**: Explain why implementation differs from design
6. **Run tests**: Include test results (X/Y passing) in implementation notes
7. **After Implementation** add a summary of deviations from original design

### When Answering Questions

1. **Reference design logs** by number when relevant (e.g., "See Design Log #50")
2. **Use codebase terminology**: ViewState, Contract, JayContract, phase annotations
3. **Show type signatures**: This is a TypeScript project with heavy type usage
4. **Do not preserve backward compatibility** unless explicitly requested. This is an experimental framework — prefer clean APIs over backward-compatible shims

### On User Feedback

1. **Assess feedback type**: Clarification → answer directly; Bug → fix or design log; Feature → evaluate design log need; Implementation issue → append to existing log
2. **Append to existing design log** if: relates to in-progress work, missed constraint, implementation deviation, or refines existing design
3. **Create new design log** if: new feature, multi-component change, architectural challenge, or affects multiple design logs
4. **Ask clarifying questions** when: goal unclear, scope ambiguous, trade-offs exist, or missing context
5. **Proceed directly** when: feedback specific and actionable, solution straightforward, no significant trade-offs
6. **When uncertain**: State assumptions, propose options (quick fix vs. proper solution), ask for preference

### Design Log Index

1. **Maintain `./design-log/index.md`**: Catalog important design logs by category in markdown tables
2. **Before reading**: Check index.md first to find relevant design logs
3. **After creating/updating**: Add new entries to appropriate category table

IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.

## Creating Jay Artifacts

When creating jay artifacts (pages, components, contracts, plugins, templates), read the relevant role guides under `packages/jay-stack/stack-cli/agent-kit-template/` before writing code:

- **Jay Designer** — `agent-kit-template/designer/INSTRUCTIONS.md` — Creates `.jay-html` pages, binds to contracts and plugins, template syntax, styling
- **Jay Developer** — `agent-kit-template/developer/INSTRUCTIONS.md` — Creates `page.ts` components, page contracts, project config, services, state management
- **Jay Plugin Developer** — `agent-kit-template/plugin/INSTRUCTIONS.md` — Creates headless components, `plugin.yaml`, contracts, actions, services, plugin routes

Each role directory contains detailed guides on specific topics (routing, contracts, refs, render results, etc.). Read the `INSTRUCTIONS.md` first to understand the role's scope, then consult topic-specific guides as needed.

### CODING STANDARD

IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.
IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.
IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.
IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.
IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.
IMPORTANT - YOU ARE NOT ALLOWED TO USE toContain ON CODE FILES.
