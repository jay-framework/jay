# Design Log #240 — Dev-Only Project Pages

## Status

**[Implemented]** — 2026-11-26. Approved at design review (product and architecture). See Implementation Results.

## Decisions for the Implementer (TL;DR)

1. **Marker = a `<meta name="jay-dev-only">` in the page's `page.jay-html` `<head>`.** Presence means dev-only. `content` is optional; when present it must be exactly `"true"` (anything else is a validate error, see 6). No new file type, folder convention, or `.jay` setting.
2. **The route scanner sets `devOnly: true`.** `parseHeadlessProps` already parses the `<head>` of every `page.jay-html` at scan time (`route-scanner/lib/route-scanner.ts:283-332` ✅ verified at implementation); extend that single parse to also report the marker, and set `route.devOnly = true` before `routes.push(route)` (`route-scanner.ts:183`). Zero extra file I/O. Every consumer of `scanRoutes` (dev server, build, validate, internal-link check) gets the flag for free.
3. **Dev server: no change in behavior.** It serves the page like any other; `DevServerService.listRoutes()` already forwards `fsRoute.devOnly` (`dev-server/lib/dev-server-service.ts:75-82`). Per DL#171 the framework does not hide or block dev-only routes; consumers filter.
4. **Production build: fix one real leak.** `build-pipeline.ts:289-296` already drops devOnly routes from compilation, bundling, and the manifest, **but** `discoverServerEntries` compiles every scanned route's `page.ts` into the backend bundle _before_ that filter (`production-build/lib/builder/server-code-build.ts:63-75`, scan at `:63` ✅). Skip `route.devOnly` there. After that fix, no artifact of a dev-only page (page code, server element, client bundle, CSS, pre-render, manifest entry, sitemap/llms.txt line) reaches the build output.
   4a. **A dev-only project page never shadows a plugin's production route in the build.** Both `scanPluginRoutes` copies drop a plugin route whose path a project route already has (`production-build/lib/builder/plugin-routes.ts:20,28-33` ✅, `dev-server/lib/dev-server.ts:194,202-207` ✅), and the build passes the _unfiltered_ project routes (`build-pipeline.ts:283` ✅). So a dev-only `/settings` would silently delete a plugin's production `/settings`. Fix: in the build, call `scanPluginRoutes(options.projectRoot, routes.filter((r) => !r.devOnly))`. The dev server keeps project-wins precedence (the dev-only page is what the author is previewing). Because dev and prod then serve different pages at one URL, validate also errors with `DEV-ONLY-SHADOWS-PLUGIN-ROUTE` (see 6) so the divergence is never silent. Only package plugins provide routes: `scanPluginRoutes` skips local `src/plugins` (`plugin-routes.ts:24` ✅), so local plugins are never checked for clashes.
5. **Out of scope, stated explicitly:** project actions (`src/actions/*.actions.ts`, `server-code-build.ts:85-96`) and `src/components` / `src/plugins` code are project-wide, not page-owned, so they are never excluded by this flag. A dev-only page that needs server-only tooling logic should call a plugin `devOnly` action (DL#180). Documented in agent-kit; not enforced.
6. **Validation first (`jay-stack validate`), five checks:**
   - **`DEV-ONLY-LINKED-FROM-PROD`** (error) — a non-dev-only page has an internal `<a href>` that resolves only to a dev-only route. It is a dead link in production. Implemented inside the existing DL#210 internal-link check.
   - **`DEV-ONLY-ERROR-PAGE`** (error) — the marker appears in a reserved status-token error page (DL#218). Error pages are not routes; the marker would be silently ignored.
   - **`DEV-ONLY-INVALID-CONTENT`** (error) — `content` is present and is not `"true"` (e.g. `content="false"` would otherwise silently mean dev-only).
   - **`DEV-ONLY-MARKER-NOT-IN-HEAD`** (error) — the meta appears outside `<head>` (the scanner reads only `<head>`, so it would be silently ignored and the page would ship).
   - **`DEV-ONLY-SHADOWS-PLUGIN-ROUTE`** (error) — a dev-only project page has the same `rawRoute` as a plugin route (dev serves the project page, prod serves the plugin's).
7. **Agent-kit** (all under `packages/jay-stack/stack-cli/agent-kit-template/`): "Dev-Only Pages" section in `designer/routing.md`; pointer in `developer/routing.md`; cross-link from `plugin/plugin-routes.md` ("for project pages, use the meta marker"); note in `plugin/dev-server-service.md` and `developer/dev-server-service.md` that `listRoutes()` `devOnly` now also covers project pages and is stale until restart after toggling the marker; the five codes in `designer/validation-guide.md`.
8. **Never** touch package versions; CHANGELOG entries go under `## Unreleased`.

## Background

- **DL#171** added `devOnly` to plugin routes (`plugin.yaml` `routes[].devOnly`) as tooling metadata. Dev server serves them, `listRoutes()` reports them, consumers filter.
- **DL#180** added `devOnly` actions and finished production exclusion of dev-only routes (`build-pipeline.ts:285-296`).
- **DL#182** fixed devOnly plugin route hydration importing the server bundle.
- `JayRoute.devOnly` lives on the scanner type (`route-scanner.ts:38-39`) and is set only through `createRoute(..., { devOnly })` (`route-scanner.ts:362-378`), which only plugin routes use.
- Downstream consumers already respect the flag: sitemap (`production-server/lib/builder/generate-sitemap.ts:23`), llms.txt (`generate-llms-txt.ts:68`), manifest (`production-build/lib/builder/route-manifest.ts:42`).

## Problem

A project page under `src/pages` has no way to say "dev-server only". The generic case is tooling-generated pages: a component showcase or preview page that a tool writes into the project so it can be rendered with the project's real components, styles, and plugins. Such pages must be browsable in dev and must never ship: not routable, not in the sitemap, and not compiled into the production server or client bundles.

Today the only options are bad: delete the files before every build (fragile, easy to forget), or wrap the page in a plugin (heavy, and the page then no longer lives inside the project it previews).

## Prior Art / Adjacent Mechanisms

| Mechanism                                                                | Where                               | Relevance                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `routes[].devOnly` in `plugin.yaml`                                      | DL#171/#180; `plugin-routes.ts:53`  | Same flag, plugin-only. We reuse the flag and every consumer of it.                                                         |
| `<script type="application/jay-headless">` YAML body read by the scanner | DL#156; `route-scanner.ts:283-332`  | Per-page metadata already read from the page `<head>` at scan time.                                                         |
| `<meta name="robots" content="noindex">` → `entry.noIndex`               | DL#175; `build-pipeline.ts:459-467` | Per-page routing/SEO metadata declared as a standard head `<meta>`, read by the build. Closest precedent.                   |
| Reserved status-token folders (`pages/404/`)                             | DL#218; `route-scanner.ts:141-146`  | A folder naming convention with routing meaning. Precedent for folder conventions, but it applies to a closed set of names. |

## Null Hypothesis

_Can existing primitives do this without anything new?_

- **`noindex` meta**: no. It only hides from crawlers; the page is still built and served in production.
- **Wrap the page in a local plugin with `devOnly: true`**: it works, but the generated page would live in a plugin package instead of the project tree, need its own `plugin.yaml`, and be resolved differently from project pages. Too heavy for a one-file generator, and it breaks "preview inside the project".
- **Generator deletes the pages before build**: not deterministic. It relies on a step the build cannot see.

So something new is needed, but it should be the **smallest possible addition**: one marker that feeds the existing `devOnly` flag. No new type, no new pipeline branch.

### Mechanism options

| Option                                                   | Pros                                                                                                                                                                                                | Cons                                                                                                                                          | Verdict                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **A. `<meta name="jay-dev-only">` in `<head>`**          | Co-located in the one file a generator already writes; valid HTML that survives design-tool round-trips; the scanner already parses `<head>` (no extra I/O); mirrors the robots-`noindex` precedent | Marker is visible in the dev-served HTML (harmless: the page never ships)                                                                     | **Chosen**              |
| B. New `<script type="application/jay-page">` YAML block | Extensible to future page config                                                                                                                                                                    | New script type for one boolean; the compiler must learn to strip it; this is the "framework feature" tier for a single flag                  | Rejected (gold-plating) |
| C. `page.conf.yaml` beside `page.jay-html`               | Explicit                                                                                                                                                                                            | New file kind with no precedent in `src/pages`; another file for generators and watchers to track                                             | Rejected                |
| D. Folder convention (`_dev/`, `(dev)`)                  | Visible in the tree                                                                                                                                                                                 | Changes or complicates URL derivation (`convertToRoutePath`); generators lose control over the URL; a second reserved-name rule beside DL#218 | Rejected                |
| E. `.jay` list `devOnlyPages: [...]`                     | Central                                                                                                                                                                                             | Far from the page; a generator must edit shared user config; stale entries after renames                                                      | Rejected                |

## Questions and Answers

**Q1: Why a `<meta>` rather than a `data-` attribute on `<html>`/`<body>`?**
A: The head is where Jay reads page-level metadata (headless YAML, robots meta), and the scanner only inspects `<head>`. Body attributes are rendered output and part of the design.

**Q2: Should the dev server strip the meta from served HTML?**
A: No. It is inert, the page never ships, and keeping it makes dev-only pages identifiable in the DOM (useful to tooling).

**Q3: Can a dev-only page be dynamic (`[slug]`) or a static override?**
A: Yes. The flag is orthogonal to segments; the build filter drops the route before `loadParams` (`build-pipeline.ts:296` runs before Step 1).

**Q4: What if a dev-only static override shadows a production dynamic route (e.g. `/blog/preview` dev-only, `/blog/[slug]` prod)?**
A: In production the override is gone and `/blog/preview` falls through to `[slug]`. This is correct: it is the same behavior as deleting the page. No special handling needed.

**Q5: Does `page.ts` of a dev-only page get type-checked or bundled in production?**
A: Not bundled after the TL;DR 4 fix. Type-checking (`yarn build:check-types` / tsc in the project) is the project's own concern and is unchanged.

**Q6: What about assets in the page folder (images, CSS)?**
A: Page CSS is emitted per route by `compileRouteServerElement` (`build-pipeline.ts:434-452`), which only runs for `allRoutes`, so it is excluded. Images referenced from `public/` are copied wholesale (`build-pipeline.ts:685-690`), which is project-wide and out of scope. Generators should not put preview-only assets in `public/`; documented.

**Q7: Actions?**
A: Project actions are project-wide (TL;DR 5). There is no page-scoped action concept to exclude. A dev-only page whose only reason to exist is tooling should use plugin `devOnly` actions.

**Q8: Why errors, not warnings, for the validations?**
A: Each one is a definite defect: a dead link in production, a silently ignored marker, a marker whose meaning is the opposite of what it says. They match the severity of DL#210 broken-link errors.

**Q9: Should `listRoutes()` or dev-server navigation hide these pages?**
A: No. DL#171 settled this: metadata only, consumers filter.

**Q10: Is it acceptable that adding or removing the marker on an existing page needs a dev-server restart before `listRoutes()` reflects it (Design 2, known limitation)?**
A: Yes (product decision). Documented in agent-kit (`designer/routing.md`, both `dev-server-service.md` guides).

**Q11: Is it acceptable that, at a path a plugin also provides, the dev server serves the dev-only project page while production keeps the plugin route?**
A: Yes (product decision), provided validate reports it with `DEV-ONLY-SHADOWS-PLUGIN-ROUTE`.

**Q12: Is it acceptable that project-wide code (`src/actions`, `src/components`, `src/plugins`, `public/`) used by a dev-only page still ships?**
A: Yes (product decision). Agent-kit points server-only tooling logic to plugin `devOnly` actions (DL#180).

## Design

### 1. Scanner (`packages/jay-stack/route-scanner/lib/route-scanner.ts`)

- Rename `parseHeadlessProps` (`:283`) to something that reflects its broadened role, e.g. `parsePageHead`, returning `{ params, validations, devOnly }`. Inside, after the head is located (`:296`), `devOnly = head?.querySelector('meta[name="jay-dev-only"]') !== null` (only `<head>`, unlike the `head ?? root` fallback used for scripts, so a stray body meta is not a trigger).
- In `scanDirectory` (`:152-183`), set `route.devOnly = true` when the marker is present, before `routes.push(route)` (`:183`).
- The scanner does **not** validate `content`; it only reports presence. Validation belongs to `jay-stack validate` (single owner).
- Error-page folders are handled in `toErrorPage` (`:194`), which does not call the head parser, so the marker never affects error pages. The validator flags it (4.2).
- **Cost** (✅ grep of `scanRoutes(` callers): none new (TL;DR 2). Callers are `dev-server.ts:163,176`, `server-code-build.ts:63`, `check-internal-links.ts:103`, `validate.ts:2473`, plus the build's own scan.

### 2. Dev server

No code change. `initRoutes` (`dev-server/lib/dev-server.ts:161-167`) calls `scanRoutes`, and `listRoutes()` forwards the flag (`dev-server-service.ts:80` ✅). Optional: log `(dev-only)` for project routes like plugin routes do (`dev-server.ts:251`).

**Known limitation (stated, not handled):** `refreshRoutes` (`dev-server-service.ts:60-72` ✅) registers only routes whose `rawRoute` is new (`dev-server.ts:1666-1684` ✅); an existing route keeps its old `fsRoute`. Adding or removing the marker on an existing page therefore leaves `listRoutes().devOnly` stale until the dev server restarts. The page itself still renders correctly. Tooling that writes the marker should write it when it creates the page (the normal case), which goes through the new-route path. Refreshing `fsRoute` on rescan is a separate, general dev-server change and is out of scope.

### 3. Production build

- **Plugin-route shadowing** (TL;DR 4a): `build-pipeline.ts:283` becomes `scanPluginRoutes(options.projectRoot, routes.filter((r) => !r.devOnly))`. The devOnly filter at `:289-296` is unchanged.
- **Leak fix** in `discoverServerEntries` (`production-build/lib/builder/server-code-build.ts:69-75`): `if (route.compPath && !route.devOnly)`. Return `routes` unchanged so `build-pipeline.ts:289-294` still logs the exclusion.
- Everything else is already handled by the existing filter at `build-pipeline.ts:296`: `routeEntries`, `loadParams`, server-element compile and CSS (`:425-452`), the client instance pipeline, manifest (`:673`), and therefore sitemap/llms.txt.

Trace of what a dev-only page could produce and where each piece is stopped:

| Artifact                                   | Producer                                    | Stopped by                                 |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------ |
| `server/pages/.../page.js`                 | `discoverServerEntries` → `buildServerCode` | **new** check at `server-code-build.ts:70` |
| Pre-rendered server element + page CSS     | `build-pipeline.ts:425-452`                 | `allRoutes` filter `:296`                  |
| Client bundles per instance                | instance pipeline over `routeEntries`       | `:296`                                     |
| Manifest entry                             | `routes: routeEntries...` `:673`            | `:296`                                     |
| Sitemap / llms.txt                         | read manifest                               | not in manifest                            |
| `src/actions`, `src/components`, `public/` | project-wide                                | out of scope (TL;DR 5, Q6)                 |

### 4. Validation (`packages/jay-stack/stack-cli`)

1. **`DEV-ONLY-LINKED-FROM-PROD`** — today `buildRouteOracle(pagesBase)` (`check-internal-links.ts:99-125` ✅) builds one project-wide oracle, passed once at `validate.ts:2563-2573` ✅, and `checkInternalLinks` resolves a link via `staticUrls | assetUrls | dynamicMatchers` (`:355-358` ✅). Change `RouteOracle` (`:31-37`) to:
   ```ts
   interface RouteOracle {
     staticUrls: Set<string>; // production routes only
     dynamicMatchers: RegExp[]; // production routes only
     devOnlyStaticUrls: Set<string>; // new
     devOnlyDynamicMatchers: RegExp[]; // new
     selfUrlByPath: Map<string, string>; // unchanged, all routes
     devOnlyJayHtmlPaths: Set<string>; // new, path.resolve(route.jayHtmlPath), keyed like selfUrlByPath
   }
   ```
   `buildRouteOracle` partitions on `route.devOnly`. In `checkInternalLinks`, the linking file is dev-only when `devOnlyJayHtmlPaths.has(path.resolve(projectRoot ?? '.', relativePath))` (same key as `:275`). Classification order for a target:
   1. resolves via production `staticUrls`, `assetUrls`, or production `dynamicMatchers` → OK (e.g. `/blog/preview` matching prod `/blog/[slug]` is not flagged, per Q4);
   2. else, linking file is dev-only and target resolves via dev-only URLs/matchers → OK;
   3. else, target resolves via dev-only URLs/matchers → `DEV-ONLY-LINKED-FROM-PROD` error (instead of the generic broken-link error), suggestion "remove the link or mark the linking page dev-only"; honours the existing `allow-broken-links` suppression;
   4. else → existing broken-link error, unchanged.
      The Tier 2 check (`checkTemplateLinksAgainstBuild`, `check-build-output.ts:387-416` ✅) needs no devOnly change: it re-checks only links that match `linkOracle.dynamicMatchers`, which after the partition holds production matchers only, against URLs the build produced (which never include dev-only pages).
      Red-first fixtures, one per branch: prod→prod static (no finding), prod→URL matching both a dev-only static and a prod `[slug]` (no finding), dev-only→dev-only (no finding), prod→dev-only static and prod→dev-only dynamic (new code), prod→nowhere (existing broken-link message).
2. **`DEV-ONLY-ERROR-PAGE`** — its own `scanRoutes` call (or a shared one), **not** the scan inside `if (!allowNoErrorPages)` (`validate.ts:2471-2476` ✅), so `allow-no-error-pages: true` does not disable it. For each `errorPages` entry, error if its `page.jay-html` head has the marker.
3. **`DEV-ONLY-INVALID-CONTENT`** and **`DEV-ONLY-MARKER-NOT-IN-HEAD`** — a new `checkDevOnlyMarker(jayHtmlPath): string[]` in `validate.ts`, beside `checkPageComponentExport` (`:582`) and called next to it in the per-page loop (`:2159` ✅). It parses the file once and reports a marker with `content` ≠ `"true"`, and any `meta[name="jay-dev-only"]` not inside `<head>`.
4. **`DEV-ONLY-SHADOWS-PLUGIN-ROUTE`** — in `validate.ts`, after the scan, call the production `scanPluginRoutes(projectRoot, [])` (no project routes, so nothing is skipped) and error for each dev-only project route whose `rawRoute` equals a plugin route path. Local plugins are not checked (they provide no routes, see TL;DR 4a). ✅ verified: no dependency cycle — `stack-cli` already depends on `production-build` (`stack-cli/package.json:35`), and `production-build` does not depend on `stack-cli`.

Rule codes follow the existing `UPPER-KEBAB` style (e.g. `REGION-NOT-LINKED`, `validate.ts:1369`).

## Implementation Plan

1. **Scanner** — head parse returns `devOnly`; set on route. Unit tests in `route-scanner/test`: marker present → `devOnly: true`; absent → key absent; marker in `<body>` only → absent; marker in error-page folder → no route, error page unaffected.
2. **Build leak fix** — `server-code-build.ts`. Test: `discoverServerEntries` on a fixture with a dev-only page omits its `pages` entry but still returns the route.
3. **Build integration test** — a fixture project with one prod page and one dev-only page (with `page.ts` and CSS): assert no file under the build output contains the dev-only route dir or page module, the manifest has no entry, the sitemap has no URL.
4. **Plugin-route shadowing** — `build-pipeline.ts:283` filter. Red-first build test: a project with dev-only `src/pages/settings` and a plugin providing prod `/settings` → the manifest contains the plugin's `/settings`.
5. **Validations** — five rules with red-first tests (fixtures written to the correct expected findings before code; link rule per 4.1 branches).
6. **Agent-kit** — the files in TL;DR 7, by full path under `packages/jay-stack/stack-cli/agent-kit-template/`.
7. **Close-out** — append Implementation Results; set status `[Implemented]` here and in `index.md`; CHANGELOG under `## Unreleased` for route-scanner, production-build, stack-cli.

## Examples

```html
<!-- src/pages/_preview/button/page.jay-html -->
<html>
  <head>
    <meta name="jay-dev-only" />
    <script type="application/jay-headless" plugin="ui-kit" contract="button" key="button"></script>
  </head>
  <body>
    <div class="preview"><jay:button>Primary</jay:button></div>
  </body>
</html>
```

- `jay-stack dev` → `/_preview/button` renders; `listRoutes()` → `{ path: '/_preview/button', ..., devOnly: true }`.
- `jay-stack build` → `[Build] Excluding 1 devOnly route(s) from production: /_preview/button`; no trace in the output.
- `<a href="/_preview/button">` on `src/pages/page.jay-html` → `DEV-ONLY-LINKED-FROM-PROD` error.
- `<meta name="jay-dev-only" content="false">` → `DEV-ONLY-INVALID-CONTENT` error (delete the tag to make the page public).

## Trade-offs

- **Meta marker vs. extensible page config**: a single boolean today. If more page-level flags appear, a dedicated page-config block can be designed then, with this marker as a migration input. YAGNI now.
- **Project-wide code still ships**: excluding page-owned code only keeps the flag honest and simple. Full tree-shaking of shared code used only by dev-only pages is not attempted.
- **Validation in `validate`, not the scanner**: the scanner stays a pure reader; a project that skips `validate` can ship a `content="false"` mistake as dev-only. That is the safe direction (it excludes, never leaks).

## Verification Criteria

1. Scanner unit tests above pass; existing scanner tests are unchanged.
2. Build fixture: grep of the full build output for the dev-only route's folder name and page module name finds nothing; manifest, sitemap, llms.txt have no entry; production pages build as before.
3. Dev server: the dev-only page renders at its URL; `listRoutes()` reports `devOnly: true`.
4. Each validate rule has a failing-then-passing fixture; a project with no marker gets zero new findings.
   4a. Plugin-route build test: with a dev-only project page at `/settings` and a package plugin providing a production `/settings`, the production plugin-route scan returns the plugin's `/settings`; with a production project page at `/settings`, it returns no plugin route (project precedence unchanged).
   4b. Error-page rule: a fixture with `.jay` `validations: { allow-no-error-pages: true }` and the marker on `pages/404/page.jay-html` still reports `DEV-ONLY-ERROR-PAGE`.
5. `yarn confirm` passes.

## Feedback Loop (jay-feedback decision)

- **Validation**: yes, five `jay-stack validate` rules (TL;DR 6). The link rule is the highest value: it catches the only user-visible production defect this feature can cause.
- **Agent-kit**: yes. Agents generating tooling pages must learn the marker, that project actions/`public/` are not excluded, and that production pages must not link to dev-only pages.
- **Framework feature**: minimal: one scanner read and one build guard, both feeding the existing `devOnly` flag.

## Scope Pre-Mortem

_"It shipped and failed. Why?"_

- **A dev-only page's code still leaked** → the `server-code-build.ts` path was missed. Covered by TL;DR 4 and the grep-the-output verification.
- **Shared code it used shipped and pulled in a compiler-only dependency** → out of scope by design; agent-kit says to put tooling logic behind plugin `devOnly` actions (DL#180), where the DL#179 leak scan applies.
- **Production link to a preview page 404s** → `DEV-ONLY-LINKED-FROM-PROD`.
- **A dev-only `/settings` page silently removed a plugin's production `/settings`** → build passes only non-dev-only project routes to `scanPluginRoutes` (TL;DR 4a), plus `DEV-ONLY-SHADOWS-PLUGIN-ROUTE`.
- **The marker was put in `<body>` and the page shipped** → `DEV-ONLY-MARKER-NOT-IN-HEAD`.
- **Someone wrote `content="false"` and the page vanished from prod** → `DEV-ONLY-INVALID-CONTENT`.
- **Scope creep into page-config syntax or dev-server hiding** → rejected in Options B and Q9.

## Relationship to Other Logs

- Extends **#171** / **#180** (`devOnly` flag and its production exclusion) from plugin routes to project pages.
- Reuses the head-parse path of **#156** and the head-metadata precedent of **#175**.
- Interacts with **#210** (internal links) and **#218** (error pages).

## Implementation Results

Implemented 2026-11-26, TDD (each test below written to the correct expected result and seen red before the code).

### What consumers write

Put this exact tag in the `<head>` of the page's `page.jay-html` (no `content`, or `content="true"`):

```html
<meta name="jay-dev-only" />
```

### Changes

- **route-scanner** — `parseHeadlessProps` renamed to `parsePageHead` (one caller, `scanDirectory`; grep found no others), returning `{ params, validations, devOnly }`; `devOnly` is read from `<head>` only. New export `DEV_ONLY_META_SELECTOR`.
- **production-build** — `discoverServerEntries` skips `route.devOnly` page modules (still returns the route). New `scanProductionPluginRoutes(projectRoot, projectRoutes)` (filters dev-only project routes, then `scanPluginRoutes`), used by `build-pipeline.ts` step 0f.
- **stack-cli** — `RouteOracle` partitioned per Design 4.1 (`addRouteToOracle`, `resolveTarget`); `checkDevOnlyMarker`, `checkDevOnlyErrorPages`, `checkDevOnlyShadowsPluginRoute` in `validate.ts`; one `scanRoutes` call now shared by the error-page nudge and the dev-only checks.
- **agent-kit** — every file listed in TL;DR 7.

### Tests

| Area                     | File                                              | New tests                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scanner                  | `route-scanner/test/route-scanner.test.ts`        | 4 (marker → devOnly; absent; body-only; marked error-page folder)                                                                                                                                       |
| Server-code skip         | `production-build/test/server-code-build.test.ts` | 2                                                                                                                                                                                                       |
| Production plugin routes | `production-build/test/plugin-routes.test.ts`     | 2 (Verification 4a)                                                                                                                                                                                     |
| Build integration        | `production-build/test/build.test.ts`             | 3 (no manifest entry; no file or content in the build output names the page, its module sentinel or its CSS class; production pages still built)                                                        |
| Validate (5 rules)       | `stack-cli/test/validate-dev-only-pages.test.ts`  | 11 (oracle partition; 6 link branches incl. suppression; integration for all five codes with `allow-no-error-pages: true` (Verification 4b); no findings without the marker; plugin-shadow tmp project) |
| Agent-kit                | `stack-cli/test/agent-kit-dev-only-pages.test.ts` | 4                                                                                                                                                                                                       |

Package runs: route-scanner 28/28, production-build 111/111, stack-cli 237/237. `yarn confirm`: **4851 passed, 0 failed, 11 skipped**. `yarn build` on this branch passed (the known scrum-board failure did not reproduce).

### Deviations

1. **Shadowing fix is a named helper** (`scanProductionPluginRoutes`) rather than an inline `routes.filter(...)` at `build-pipeline.ts:283`, so the Implementation Plan 4 test can exercise it without a full build of a package plugin. Behaviour is identical.
2. **`checkDevOnlyMarker` takes the file content**, not a path: the per-page loop already has it read.
3. **Messages start with their rule code** (`DEV-ONLY-…: …`), so agents can match the agent-kit table. No other validate rule embeds its code; these do.
4. **`DEV-ONLY-SHADOWS-PLUGIN-ROUTE` names the plugin by its package name** (what `scanPluginRoutes` returns), and loads production-build lazily (`await import`, like `run-production.ts`), only when a dev-only page exists.
5. **The shared scan is guarded**: a missing pages directory yields an empty scan instead of a throw (it used to run only when the error-page nudge was on).
6. **No CHANGELOG entries**: this repo has no CHANGELOG files, so none were created (Implementation Plan 7).
7. **Not done (optional)**: the dev-server `(dev-only)` log line for project routes (Design 2).
8. Existing `RouteOracle` literal in `check-internal-links.test.ts` gained the empty dev-only fields (type change only); `route-to-express-route.test.ts` lists the new fixture's routes (it scans the whole fixture tree).

### Feedback loop outcome

Validation: five rules, as designed. Agent-kit: as designed. Framework: the scanner read plus two build guards.
