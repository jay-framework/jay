# Design Log 96: Consistent Build Folder Structure

## Background

The Jay framework generates build artifacts into a `build/` folder during development and compilation. There are two distinct contexts:

1. **Jay Stack** (full-stack) — dev server generates pre-rendered HTML, compiled templates, client entry points, and contract metadata
2. **Client-only** (Vite/Rollup plugin) — compiler generates compiled `.jay-html.ts` files (and optionally secure sandbox variants)

Both contexts write into `build/`, but the internal structure has grown organically and is inconsistent across examples and between the two contexts.

Additionally, contract metadata is duplicated between `build/materialized-contracts/` and `agent-kit/materialized-contracts/`, produced by the same `materializeContracts()` function. The `agent-kit/` folder is the intended interface for agents and could also serve the editor integration, making the build copy redundant.

## Problem

### Current Jay Stack build layout

```
build/
├── client-scripts/                     # HTML entry points per route (debug only)
├── slow-render-cache/                  # Pre-rendered .jay-html files
├── jay-runtime/
│   ├── build/slow-render-cache/        # Same templates compiled to .jay-html.ts
│   └── src/pages/                      # Source mirror (inconsistently present)
└── materialized-contracts/             # Contract/plugin YAML indexes
```

### Current client-only build layout (varies per example)

```
build/
└── jay-runtime/
    ├── lib/                            # Compiled .jay-html.ts (when source is lib/)
    ├── src/                            # Compiled .jay-html.ts (when source is src/)
    └── lib-secure/                     # Sandbox variants (when secure mode)
```

### Specific inconsistencies

1. **`build/jay-runtime/build/slow-render-cache/`** — "build inside build" is confusing. The path `build/jay-runtime/build/` reads as two nested build folders.

2. **`slow-render-cache/` exists in two places** — raw `.jay-html` files in `build/slow-render-cache/` and compiled `.jay-html.ts` wrappers in `build/jay-runtime/build/slow-render-cache/`. Same logical content, duplicated with different formats.

3. **`jay-runtime/src/pages/` appears inconsistently** — present in `store-light` and `studio-store` examples but absent from `store`, `whisky-exchange`, `fake-shop`, and others. Its purpose vs. the `build/slow-render-cache/` TS version is unclear.

4. **Client-only source directory leaks into build** — the build folder mirrors whether source is in `lib/` or `src/`, making the output structure unpredictable. One example (`todo-rollup-build`) puts files at `build/lib/` without the `jay-runtime/` prefix at all.

5. **`client-scripts/` naming inconsistencies** — fake-shop produces trailing dashes (`cart-.html`, `checkout-.html`) while other examples don't (`cart.html`).

6. **Folder names describe mechanisms, not content** — `slow-render-cache` describes a caching strategy, `jay-runtime` is an overloaded term (also a package name), `client-scripts` is vague.

### Where the paths are hardcoded

| Artifact                                           | Source file                                                | Line |
| -------------------------------------------------- | ---------------------------------------------------------- | ---- |
| `build/` default                                   | `dev-server/lib/dev-server.ts`                             | 73   |
| `client-scripts/`                                  | `dev-server/lib/dev-server.ts`                             | 816  |
| `slow-render-cache/`                               | `dev-server/lib/dev-server.ts`                             | 1178 |
| `materialized-contracts/`                          | `stack-server-runtime/lib/contract-materializer.ts`        | 327  |
| `build/materialized-contracts` (resolver fallback) | `compiler-jay-html/lib/jay-target/jay-import-resolver.ts`  | 91   |
| `build/jay-runtime` (outputDir)                    | `stack-cli/lib/server.ts`                                  | 37   |
| `jay-runtime/` (Vite plugin)                       | `compiler/rollup-plugin/lib/common/files.ts`               | 44   |
| Vite plugin config                                 | `compiler/rollup-plugin/lib/runtime/jay-plugin-context.ts` | 26   |

## Design

### Proposed structure

The build folder mirrors the source layout directly. Compiled `.ts` files sit alongside their source `.jay-html` files. No extra `compiled/` wrapper.

```
build/
├── <mirrors source layout>       # Compiled .jay-html.ts (e.g., lib/, src/, lib-secure/)
│
├── pre-rendered/                  # Slow-phase HTML + compiled TS wrappers (Jay Stack only)
│   └── <mirrors route layout>    # e.g., page.jay-html + page.jay-html.ts side by side
│
└── debug/                         # Debug-only artifacts (dev server only)
    └── client-entry/              # Generated HTML entry points per route
        ├── index.html
        └── cart.html
```

Contracts are **not** in the build folder. See "Unifying contracts into agent-kit" below.

### What changes and why

| Current                                  | Proposed                     | Rationale                                                                          |
| ---------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `jay-runtime/<lib\|src>/`                | `<lib\|src>/` (no wrapper)   | Drop the `jay-runtime/` prefix; source layout mirrors directly into `build/`       |
| `jay-runtime/lib-secure/`                | `lib-secure/` (no wrapper)   | Same — no collision since `lib/` and `lib-secure/` are distinct source directories |
| `jay-runtime/build/slow-render-cache/`   | `pre-rendered/*.jay-html.ts` | Compiled TS sits alongside pre-rendered HTML; no nested build directories          |
| `slow-render-cache/`                     | `pre-rendered/`              | Describes content (pre-rendered HTML), not mechanism (cache)                       |
| `build/materialized-contracts/`          | Removed from build           | Unified into `agent-kit/materialized-contracts/` (see below)                       |
| `client-scripts/`                        | `debug/client-entry/`        | These exist only for debugging; make that explicit                                 |
| `jay-runtime/src/pages/` (source mirror) | Removed                      | Redundant                                                                          |

### Unifying contracts into agent-kit

Currently, materialized contracts are duplicated:

- **`build/materialized-contracts/`** — written by dev server on startup, read by `JAY_IMPORT_RESOLVER` for dynamic contract resolution
- **`agent-kit/materialized-contracts/`** — written by `jay-stack agent-kit` command, read by AI agents

Both are produced by the same `materializeContracts()` function and contain identical data. The only runtime consumer of `build/materialized-contracts/` is `JAY_IMPORT_RESOLVER.loadPluginContract()` in `compiler-jay-html/lib/jay-target/jay-import-resolver.ts:91`, which falls back to it when resolving dynamic contracts. The editor integration uses the same resolver indirectly.

**Decision:** Remove `build/materialized-contracts/` entirely. Both the dev server and the import resolver should use `agent-kit/materialized-contracts/` as the single location for materialized contracts.

**Changes:**

- Dev server startup writes contracts to `agent-kit/materialized-contracts/` instead of `build/materialized-contracts/`
- `JAY_IMPORT_RESOLVER` fallback path changes from `build/materialized-contracts` to `agent-kit/materialized-contracts`
- The `jay-stack agent-kit` command continues to work as before (it already writes to `agent-kit/materialized-contracts/`)
- The editor integration requires no changes — it uses the resolver, which now points to agent-kit

This means `agent-kit/materialized-contracts/` is always kept fresh by the dev server, and agents always see up-to-date contracts without needing to run `jay-stack agent-kit` separately during development.

### Design principles

1. **Names describe content, not mechanism** — `pre-rendered` not `slow-render-cache`
2. **No nested build directories** — `build/pre-rendered/...` instead of `build/jay-runtime/build/slow-render-cache/...`
3. **No unnecessary wrapper directories** — compiled output mirrors source layout directly under `build/`
4. **Same top-level structure for both contexts** — Jay Stack projects just have more folders than client-only ones
5. **Debug artifacts are clearly separated** — `debug/` is obviously non-essential

### Client-only project (example: todo with source in `lib/`)

```
build/
├── lib/
│   ├── app.jay-html.ts
│   ├── todo.jay-html.ts
│   └── item.jay-html.ts
└── lib-secure/
    ├── app.jay-html.ts
    ├── app.jay-html?jay-workerTrusted.ts
    ├── todo.jay-html?jay-workerSandbox.ts
    └── item.jay-html?jay-mainSandbox.ts
```

### Jay Stack project (example: store)

```
build/
├── pre-rendered/                          # HTML and compiled TS side by side
│   ├── page.jay-html
│   ├── page.jay-html.ts
│   ├── cart/
│   │   ├── page.jay-html
│   │   └── page.jay-html.ts
│   └── products/
│       ├── page.jay-html
│       ├── page.jay-html.ts
│       └── [slug]/
│           ├── page_2b5d64d8.jay-html
│           ├── page_2b5d64d8.jay-html.ts
│           ├── page_a8a43fe5.jay-html
│           └── page_a8a43fe5.jay-html.ts
└── debug/
    └── client-entry/
        ├── index.html
        ├── cart.html
        └── products.html

agent-kit/
└── materialized-contracts/                # Single location for contract metadata
    ├── contracts-index.yaml               #   (used by resolver, agents, and editor)
    ├── plugins-index.yaml
    └── wix-stores/
        └── product-page.jay-contract
```

## Implementation Plan

### Phase 1: Compiler plugin (client-only projects)

1. **`rollup-plugin/lib/runtime/jay-plugin-context.ts`** — When `outputDir` is set, strip the source directory prefix (`lib/`, `src/`) from the relative path so output is flat under the output dir. For secure mode, write to a parallel `compiled-secure/` sibling.

2. **`rollup-plugin/lib/common/files.ts`** (`writeGeneratedFile`) — Apply the path normalization from step 1.

3. **`stack-cli/lib/server.ts`** — Change `outputDir` from `'build/jay-runtime'` to `'build/compiled'`.

4. **Update Vite config fixtures** in `rollup-plugin/test/` that reference `build/jay-runtime`.

### Phase 2: Dev server (Jay Stack projects)

5. **`dev-server/lib/dev-server.ts`** line 816 — Change `client-scripts` to `debug/client-entry`.

6. **`dev-server/lib/dev-server.ts`** line 1178 — Change `slow-render-cache` to `pre-rendered`.

7. **`dev-server/lib/dev-server.ts`** line 1114 — Change contract materialization output from `path.join(buildFolder, 'materialized-contracts')` to `path.join(projectRootFolder, 'agent-kit', 'materialized-contracts')`. The dev server now writes contracts to `agent-kit/` instead of `build/`.

8. **`stack-server-runtime/lib/contract-materializer.ts`** line 327 — Change default `outputDir` from `path.join(projectRoot, 'build', 'materialized-contracts')` to `path.join(projectRoot, 'agent-kit', 'materialized-contracts')`.

### Phase 3: Import resolver

9. **`compiler-jay-html/lib/jay-target/jay-import-resolver.ts`** line 91 — Change dynamic contract fallback path from `path.join(projectRoot, 'build/materialized-contracts')` to `path.join(projectRoot, 'agent-kit/materialized-contracts')`.

### Phase 4: References and imports

10. **`dev-server/lib/vite-factory.ts`** — Update comment referencing `build/client-scripts/` and `build/slow-render-cache/`.

11. **Client script generation** — Update any import paths in generated client HTML that reference `build/slow-render-cache` or `build/jay-runtime/build/slow-render-cache` to use `build/pre-rendered` and `build/compiled`.

### Phase 5: Clean up examples

12. Delete all existing `build/` folders in examples (they're regenerated).

13. Update `.gitignore` if any example-specific ignores reference old folder names.

14. Run the dev server on one example to verify the new structure.

### Phase 6: Tests

15. Run `yarn confirm` to catch any test that references old path names.

16. Update test fixtures and assertions that hardcode old folder names.

## Trade-offs

**Pros:**

- Consistent, predictable structure across all project types
- Self-documenting folder names
- No confusing nested `build/build` paths
- Debug artifacts clearly separated from production-relevant output
- No redundant wrapper directories — compiled output sits alongside source
- Single source of truth for contracts (`agent-kit/materialized-contracts/`) — no duplication
- Dev server keeps agent-kit contracts fresh automatically, so agents always see current data during development

**Cons:**

- Breaking change for anyone with tooling that references current build paths (mitigated by the fact that `build/` is gitignored and regenerated)
- Multiple files to change across packages
- Existing examples need `build/` folders deleted and regenerated
- `agent-kit/` folder must exist for the import resolver to find dynamic contracts — but this is already the case in practice since `jay-stack agent-kit` is a required setup step

**Risk:**

- Generated client HTML imports reference `build/slow-render-cache` paths — these must be updated in the template generation code, not just the folder names, or the dev server will break at runtime. This is the most important thing to get right.

## Implementation Results

All changes implemented and verified. `yarn build` and `yarn test` pass across all 67 packages.

### Deviation from plan

The initial design proposed a `compiled/` wrapper directory. This was dropped because it created unnecessary nesting — especially for Jay Stack where `compiled/pre-rendered/` was redundant. Instead, `outputDir` was set to `build/` directly, and the `build/` prefix is stripped from relative paths in `writeGeneratedFile()` to prevent nested build directories.

The result is that compiled `.ts` files sit alongside their source `.jay-html` files:

```
build/pre-rendered/cart/page.jay-html       # pre-rendered HTML
build/pre-rendered/cart/page.jay-html.ts    # compiled TS wrapper (was: build/jay-runtime/build/slow-render-cache/cart/page.jay-html.ts)
build/lib/app.jay-html.ts                  # compiled from lib/ source (was: build/jay-runtime/lib/app.jay-html.ts)
```

### Files modified

**Core framework (jay repo):**

- `packages/compiler/rollup-plugin/lib/common/files.ts` — strip `build/` prefix in `writeGeneratedFile`
- `packages/jay-stack/stack-cli/lib/server.ts` — outputDir `build/jay-runtime` → `build`
- `packages/jay-stack/dev-server/lib/dev-server.ts` — `client-scripts` → `debug/client-entry`, `slow-render-cache` → `pre-rendered`, contracts → `agent-kit/materialized-contracts`
- `packages/jay-stack/dev-server/lib/dev-server-options.ts` — updated comment
- `packages/jay-stack/dev-server/lib/vite-factory.ts` — updated comment
- `packages/jay-stack/stack-server-runtime/lib/contract-materializer.ts` — default outputDir → `agent-kit/materialized-contracts`
- `packages/jay-stack/stack-cli/lib/cli.ts` — updated comment
- `packages/compiler/compiler-jay-html/lib/jay-target/jay-import-resolver.ts` — fallback → `agent-kit/materialized-contracts`
- `docs/core/building-jay-packages.md` — updated docs reference

**Vite configs (31 files):**

- `packages/compiler/rollup-plugin/test/jayRuntime/fixtures/*/source/vite.config.ts` (2)
- `packages/jay-stack-plugins/*/vite.config.ts` (2)
- `examples/*/vite.config.ts` (22)
- `wix/packages/*/vite.config.ts` (5)

**Generated files (wix repo):**

- `wix/examples/cms/src/pages/**/page.jay-html.d.ts` (4) — import paths → `agent-kit/materialized-contracts`
