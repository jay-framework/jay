# DL#224 — Dev-server SSR perf: cache `analyzeExportedTypes`

Status: **[Implemented: cache + purge]** · **[Exploring: shared TS program]**

## Decisions for the Implementer (TL;DR)

1. **Problem:** every SSR request re-runs the TypeScript type analyzer. `loadPageParts` calls `parseJayFile`
   per request, and `parseJayFile` runs `analyzeExportedTypes` (a fresh `ts.createProgram`) on each **local
   `src=` component import** (`jay-html-parser.ts:597/782`). Uncached → **~400–800ms per request** for pages
   composing local components (scales with import count), while page-only / plugin-contract pages are ~1–3ms.
2. **Fix (shipped):** memoize `analyzeExportedTypes` in `JAY_IMPORT_RESOLVER`, keyed by the analyzed file's
   **path + mtime** (+ tsconfig). Repeat requests drop to ~2ms; also speeds the production build (a component
   imported by many pages is analyzed once).
3. **Invalidation:** mtime busts a **direct** edit (and covers the build, which has no watcher). The dev server
   also **purges** the cache on `.ts` / `.tsx` / `.d.ts` / `.jay-contract` change (in the existing
   `vite.watcher.on('change')`) to catch **transitive** edits (a contract/dep changing without touching the
   component — which mtime-on-the-analyzed-file can't see).
4. **Residual / next:** the **cold first hit** per component-set still pays one `createProgram`; and the cache
   is currently a **module-level singleton** `Map`. Next step (exploring): a **single reusable TS program /
   LanguageService threaded through the dev-server + production-build layers** — not a module singleton — to
   cut the cold cost and keep tests isolated. See "Exploration" below.

## Measurements (smoke-test, live dev server)

| page (local comps)     | before (every req) | 1st req (cold) | cached  |
| ---------------------- | ------------------ | -------------- | ------- |
| nested-composition (3) | ~1500ms            | ~800ms         | **2ms** |
| headfull               | ~844ms             | ~400ms         | **3ms** |
| free-ref               | ~867ms             | ~430ms         | **1ms** |
| nested                 | ~924ms             | ~400ms         | **1ms** |

Page-only (`/foreach`) and plugin-contract (`/headless`) pages were already ~1–3ms (no local-component type
analysis). Verified the purge: cold → cached → `touch component.ts` → cold again → cached.

## Implementation (shipped)

- `compiler-jay-html/lib/jay-target/jay-import-resolver.ts`: module-level `exportedTypesCache` keyed by
  `<resolvedFile>::<mtimeMs>::<tsconfig>`; `clearExportedTypesCache()` exported.
- `compiler-jay-html/lib/index.ts`: re-exports `clearExportedTypesCache`.
- `dev-server.ts`: calls `clearExportedTypesCache()` at the top of `vite.watcher.on('change')` for
  `.ts`/`.tsx`/`.jay-contract` (`.d.ts` matches the `.ts` test).
- Verified: compiler-jay-html suite 754 pass; pages still render correctly.

## Exploration — a single TS program/LanguageService, threaded (not a singleton)

**Goal:** remove the cold `createProgram` cost and share the analyzer across **both** the dev server (long-lived,
one per project, incrementally invalidated) and the production build (one-shot, one per build) — **without** a
module-global singleton, which would couple tests, defeat isolation, and make parallel runs collide.

**Why not a singleton:** the current `JAY_IMPORT_RESOLVER` (and its cache) is module-global. For a stateful TS
program that is worse — tests would share a program/checker across cases, and resetting/parallelizing becomes
fragile. The program's lifetime must be **owned by the caller** (a dev-server instance, a build run, or a test)
and passed down.

**Sketch (to design):**

- An `AnalysisContext` (or `TypeAnalyzer`) object owning a persistent `ts.LanguageService` + `DocumentRegistry`
  (or an incremental builder program) + the exported-types cache, created once per owner.
- Thread it as a parameter, replacing the singleton `JAY_IMPORT_RESOLVER`: dev-server/build create it and pass
  it → `loadPageParts` → `parseJayFile(..., resolver)` → it already takes a resolver, so the seam exists.
- `JAY_IMPORT_RESOLVER` becomes `createJayImportResolver(analysisContext?)`; the module singleton can remain a
  thin default for callers that don't thread one (or be removed).
- A LanguageService naturally tracks dependencies, so bumping a changed file's version yields transitively-fresh
  types — potentially **subsuming** both the mtime cache and the watcher purge.

Open questions for the exploration: program/LS lifetime & ownership per layer; file-version source (mtime vs
watcher events); build vs dev config; how many call sites import the singleton `JAY_IMPORT_RESOLVER` today and
the migration cost; whether to keep a default singleton for non-threaded callers.
