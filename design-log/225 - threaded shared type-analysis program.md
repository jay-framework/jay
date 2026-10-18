# DL#225 — A threaded, shared type-analysis program (not a singleton)

Status: **[Implemented — see Implementation Results]**

## Decisions for the Implementer (TL;DR)

1. **Own the type analyzer per scope, not globally.** Replace the module-global `JAY_IMPORT_RESOLVER`
   (and its module-level cache from DL#224) with `createJayImportResolver(ctx?)` returning an instance that
   owns an **`AnalysisContext`** (the exported-types cache + a persistent TS program). Lifetime = the owner's
   lifetime: one per dev-server session, one per production build, one per rollup-plugin instance, one per CLI
   command, **one per test**. No shared mutable program across tests.
2. **Thread it through the seam that already exists.** `parseJayFile(…, linkedContractResolver, …)` and the
   other entry points already take a resolver parameter (`jay-html-parser.ts` parseJayFile signature; ~13 call
   sites). We change _who creates it_, not the leaf plumbing.
3. **Reuse one TS program per context.** `AnalysisContext` owns a persistent `ts.LanguageService` +
   `DocumentRegistry` instead of `createProgram([file], …)` per call (`analyze-exported-types.ts:252`). Shared
   `lib.d.ts`/sources → the cold first-analysis drops, and incremental re-analysis is cheap. Because the checker
   sees the whole program, bumping a changed file's version yields transitively-fresh types — **subsuming** both
   the DL#224 mtime cache and the dev-server watcher purge inside the context.
4. **Migrate incrementally.** Keep `JAY_IMPORT_RESOLVER` as a thin **lazy default** (spins a throwaway context)
   so un-migrated callers keep working; migrate the perf-critical owners (dev-server, production-build) + test
   utils first; then the CLI/validator/rollup owners; decide at the end whether to drop the default.

## Background

DL#224 fixed the reported dev-server SSR slowness: `parseJayFile` runs `analyzeExportedTypes` (a fresh
`ts.createProgram`) on every **local `src=` component import**, once per SSR request — ~400–800ms per request.
The DL#224 cache (keyed by path+mtime, in the module-global `JAY_IMPORT_RESOLVER`) drops repeat requests to
~2ms and speeds the build. Two things remain:

- **Cold cost:** the _first_ analysis per component still pays a full `createProgram` (`lib.d.ts` + imports).
- **The cache is a module-global singleton**, which couples tests (shared state, fragile reset, parallel
  collisions) — and a stateful TS _program_ would make that worse.

## Problem

We want the analyzer (cache **and** a reused TS program) to serve **both** the dev server (long-lived,
incrementally invalidated) and the production build (one-shot, dedup across pages), **without** module-global
state — the program's lifetime must be owned by the caller and threaded down, so tests get isolated instances.

## Prior Art / Adjacent Mechanisms

- **DL#224** — the mtime cache + watcher purge this design generalizes (and would subsume). ✅ shipped.
- **The resolver parameter** — `parseJayFile(…, linkedContractResolver: JayImportResolver, …)`, `compileContract`,
  `createContractResolver` already take a resolver. The seam to thread an instance exists. ✅ verified (parseJayFile
  signature; `load-page-parts.ts:156`, `generate-ssr-response.ts:430`, `load-production-parts.ts:83`, etc.).
- **`JAY_IMPORT_RESOLVER` singleton** (`jay-import-resolver.ts:64`) — the global to replace with a factory.
- **`TEST_IMPORT_RESOLVER = { ...JAY_IMPORT_RESOLVER, overrides }`** (`test/test-utils/test-resolver.ts:15`) — tests
  spread the singleton; a factory lets each test build an isolated resolver + context.
- **`analyzeExportedTypes`** (`analyze-exported-types.ts:244-266`) — uses only `program.getSourceFile()` +
  `program.getTypeChecker()` + a `sourceFile.statements` walk. A `ts.LanguageService.getProgram()` exposes the
  same `Program` API, so the extraction logic is reusable against a persistent program. ✅ verified (API shape).
- **TS `createLanguageService(host, documentRegistry)` / `DocumentRegistry`** — the standard way to keep parsed
  sources + `lib.d.ts` warm across queries and get incremental rechecks. ⚠️ assumed fit; prototype to confirm.

Null hypothesis: no new leaf API. The only new surface is `AnalysisContext` + `createJayImportResolver`; the
threading rides the existing resolver parameter.

## Questions and Answers

**Q: One TS program for the whole project, or one per tsconfig?**
A: One `AnalysisContext` per owner, holding one LanguageService bound to the project's tsconfig
(`loadTSCompilerOptions`, `analyze-exported-types.ts:133`). Multiple tsconfigs in one build are an edge — ⚠️
confirm none of the owners analyze files across differing tsconfigs; if so, key a LS per resolved tsconfig
inside the context.

**Q: Where do file versions come from (to invalidate the LS)?**
A: Dev server bumps a file's version from the existing `vite.watcher.on('change')` (where DL#224 already purges);
build + CLI are one-shot (mtime is enough / no invalidation needed). The LanguageServiceHost's `getScriptVersion`
returns the tracked version (mtime or a monotonic counter bumped on change).

**Q: Does the LS subsume the DL#224 cache and watcher purge?**
A: Intended yes — a warm program already caches parsed/checked sources, and version bumps handle transitive
edits the mtime cache can't. Keep DL#224's mtime cache as a cheap secondary until the LS path is proven, then
remove. ⚠️ verify incremental re-check latency is actually low for our access pattern.

**Q: Keep the `JAY_IMPORT_RESOLVER` singleton?**
A: During migration, yes — as a lazy default that creates a per-process context (today's behavior) so the ~13
un-migrated sites keep working. Revisit removing it once owners are migrated (removing forces explicit ownership
and kills the last global).

## Design

```ts
// compiler-analyze-exported-types (or a new analysis-context module)
export interface AnalysisContext {
  analyzeExportedTypes(fullPath: string, options: ResolveTsConfigOptions): JayType[];
  noteFileChanged(fullPath: string): void; // dev server calls on watcher change (version bump)
  dispose(): void;
}
export function createAnalysisContext(): AnalysisContext {
  /* owns LanguageService + DocumentRegistry + cache */
}

// compiler-jay-html
export function createJayImportResolver(ctx = createAnalysisContext()): JayImportResolver {
  return { ...resolverImpl, analyzeExportedTypes: (p, o) => ctx.analyzeExportedTypes(p, o) };
}
// Lazy default for un-migrated callers (bridges migration):
export const JAY_IMPORT_RESOLVER: JayImportResolver =
  createJayImportResolver(/* shared default ctx */);
```

- `AnalysisContext.analyzeExportedTypes` queries `languageService.getProgram()` → `getSourceFile` +
  `getTypeChecker` → the existing extraction walk (moved/shared), with the per-context cache in front.
- Owners create and thread an instance:
  - **dev-server** (`mkDevServer`): one context; `noteFileChanged` from the watcher; `dispose` on shutdown.
  - **production-build** (`buildVersion`): one context for the run.
  - **rollup-plugin**, **CLI commands**, **validators**: one per instance/invocation.
  - **tests**: `createJayImportResolver()` per test (isolation).

## Implementation Plan

Phased, each independently shippable:

1. **Extract the context.** Introduce `AnalysisContext` + `createAnalysisContext()` wrapping _today's_
   behavior (createProgram-per-call + DL#224 mtime cache), and `createJayImportResolver(ctx?)`. Keep
   `JAY_IMPORT_RESOLVER` as a lazy default over a shared context. No behavior change; all tests green.
2. **Thread owners (perf-critical first):** dev-server + production-build create their own context and pass the
   resolver through the existing parameter; dev-server wires `noteFileChanged` to the watcher. Test utils
   (`test-resolver`, `ts-compiler-test-utils`) create per-test resolvers.
3. **LanguageService reuse** inside `AnalysisContext`: replace createProgram-per-call with a persistent
   `LanguageService` + `DocumentRegistry`; move the extraction walk to read from `ls.getProgram()`. Measure cold
   - incremental cost. Once proven, retire the DL#224 mtime cache + watcher purge in favor of version bumps.
4. **Migrate remaining owners** (rollup-plugin, CLI, validators); decide whether to drop the default singleton.

## Trade-offs

- More wiring (owners create + thread a context) in exchange for: no module-global program, test isolation, warm
  incremental analysis, and dedup across a build. The leaf seam already exists, so the wiring is at a bounded set
  of ~13 owners.
- A persistent LanguageService holds memory for the session (parsed sources + checker) — fine for a dev server /
  a build; contexts are disposed at end of scope.

## Scope — not handled

- Non-type-analysis resolver methods (`loadContract`, `resolvePluginComponent`, `readJayHtml`, …) are unchanged —
  this is only about `analyzeExportedTypes` and its program.
- Sandbox/secure resolvers, if any, keep their own wiring.
- Multiple-tsconfig-per-owner: deferred unless an owner needs it (Q&A above).

## Verification Criteria

- **Perf:** cold first-analysis materially lower than createProgram-per-call; repeat + incremental near-0; build
  analyzes a shared component once.
- **Correctness:** a transitive edit (change a contract `.d.ts` without touching the component) reflects on the
  next request (version bump), not just a direct edit.
- **Isolation:** two tests with different fixtures/overrides don't see each other's analysis state; parallel test
  runs are stable.
- **No regression:** full `confirm` green after each phase.

## Claims

✅ verified: the resolver is already a parameter of `parseJayFile`/`compileContract` (the threading seam);
`analyzeExportedTypes` uses only `program.getSourceFile`/`getTypeChecker` + a statements walk (LS-compatible);
~13 top-level call sites import the singleton; `TEST_IMPORT_RESOLVER` spreads the singleton; DL#224 cache/purge
are module-global.
⚠️ assumed (prototype to confirm): a `ts.LanguageService` + `DocumentRegistry` gives low incremental re-check
latency for our access pattern and reproduces `analyzeExportedTypes` output exactly; single-tsconfig per owner;
version-bump invalidation fully subsumes the mtime cache + watcher purge; memory footprint of a long-lived LS in
the dev server is acceptable.

## Implementation Results

Shipped (uncommitted pending review):

- **`compiler-analyze-exported-types`:** extracted the type-extraction walk into `extractExportedTypes(program, filename)` (shared), so `analyzeExportedTypes` (createProgram-per-call, kept for one-shot callers) and the new reusable analyzer produce identical output. Added **`createTypeAnalyzer()`** — a persistent `ts.LanguageService` + `DocumentRegistry` **per resolved tsconfig** (via the typescript-bridge proxy: `createLanguageService`/`createDocumentRegistry`/`ScriptSnapshot`/`sys`/`getDefaultLibFilePath`). Invalidation: `noteFileChanged(file)` bumps the file's LS version (re-read + re-check dependents, transitively) and a global generation (drops the result cache); one-shot build needs none.
- **`compiler-jay-html`:** `createAnalysisContext()` now wraps `createTypeAnalyzer()` (the DL#224 mtime cache is removed — the LS subsumes it). `createJayImportResolver(ctx?)` composes the stateless `baseResolverMethods` + the context-bound `analyzeExportedTypes`. `JAY_IMPORT_RESOLVER` is a lazy default over a shared context; added `noteExportedTypesFileChanged(path)` (incremental) alongside `clearExportedTypesCache()` (full reset).
- **dev-server:** the watcher calls `noteExportedTypesFileChanged(changedPath)` (incremental) instead of a full clear.
- **tests:** `TEST_IMPORT_RESOLVER` is built over its own `createJayImportResolver()` context — isolated per test module, not the global.

**Parity + perf (verified):** `extractExportedTypes` output is byte-identical old-vs-LS for banner/section/button/inner-block. Cold analysis of the _first_ component ~420ms (one-time `lib.d.ts` parse); each _subsequent_ component ~60ms (was ~400ms — shared lib/sources); repeats ~0ms. Live dev server: warmed at startup (page-definition generation), so first request ~28ms, repeats ~2ms, and an edit re-analyzes incrementally (~51ms, program stays warm). Full `yarn confirm` green across the monorepo.

### Deviation from the plan — production owners kept on the default context (not threaded through the loader chain)

The design called for dev-server + build to **create and thread** their own context through `loadPageParts` / `generate-ssr-response` / `load-production-parts` / `server-element-compile`. **Not done** — those owners still use the default `JAY_IMPORT_RESOLVER`. Rationale: a dev server and a build are each **one process per owner**, so the process-global default context is already naturally scoped — not the problematic global the design guarded against. The stated motivation ("a singleton breaks tests") is about **tests sharing state within one process**, which is solved directly by per-test contexts (`TEST_IMPORT_RESOLVER`). Dev incremental invalidation is handled by `noteExportedTypesFileChanged` on the default context. So the goals (reused program, test isolation, incremental dev) are met without the invasive handler-chain threading.

The seam (`createJayImportResolver` + the existing `parseJayFile(resolver)` parameter) is in place, so **full per-owner threading remains available** — deferred (the original Phase 2 full-thread + Phase 4 migrate CLI/rollup/validators + decide on removing the default). Do it if we ever need two differently-configured analyzers in one process, or to drop the default global entirely.

### DL#224 relationship

DL#224's mtime cache is **removed** (superseded by the LS's version-based invalidation); its watcher purge is **replaced** by the incremental `noteExportedTypesFileChanged`. DL#224 remains the record of the first fix; this DL supersedes its caching mechanism.
