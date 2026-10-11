# DL#214 — Agent-discovery files (llms.txt, robots.txt, .well-known, ard.json)

**Status: [Design]** — child of [DL#212](212%20-%20agent-readability%20of%20generated%20sites.md).
The static build-time emissions that let agents discover a Jay site. Recovers the
Discovery "agent-discovery files" checks from the ora.ai scan.

---

## Decisions for the Implementer (TL;DR)

- **One build-time emission step, next to the sitemap.** All these files are generated from
  the `RouteManifest` + `.jay` `site` config at the same two call sites that already emit
  `sitemap.xml`: `production-build/lib/builder/build-pipeline.ts:657` and
  `production-server/lib/invalidation/rebuild.ts:155`. Same inputs, same output dir.
- **Confident now — ship these two:**
  1. **`llms.txt`** (llmstxt.org) — generated from the manifest: site H1 + summary +
     per-section links (title + description + URL) from each indexable route. Skips
     `devOnly`/`noIndex`. ✅ well-defined public spec.
  2. **`robots.txt`** — **upgrade from validate-only to generate**: today `validate.ts:2274`
     only _warns_ if `public/robots.txt` is missing. Generate a default (with the
     `Sitemap:` line from `site.baseUrl`) **only when the author hasn't provided one** —
     mirror the existing sitemap "don't clobber a static file" convention (`server.ts:53`).
- **`/.well-known/` — support the path (framework), don't invent the file.** `.well-known`
  is critical web infrastructure ([RFC 8615](https://www.rfc-editor.org/info/rfc8615);
  [IANA registry](https://www.iana.org/assignments/well-known-uris/well-known-uris.xhtml));
  Jay must _serve it reliably_. It's also where `ard.json` lives (`/.well-known/ard.json`), so
  this fix unblocks that item too. **Verified gap**: the dev
  server mounts `express.static(publicPath)` (`stack-cli/lib/server.ts:66`) with Express's
  default `dotfiles: 'ignore'`, so an author's `public/.well-known/*` **404s in dev** — while
  production's custom `fetchStaticFile` has no dotfile filter and _does_ serve it (the build's
  public-copy — `fs.cp(..., { recursive: true })` at `build-pipeline.ts:648` — preserves
  dotdirs). The only fix needed is dev: allow the `.well-known` dotdir. After that, any
  `.well-known/*` file the author (or a plugin) drops in `public/` just works. ✅ verified: dev
  gap is the sole blocker; prod path (copy → serve) is clear end-to-end.
  - **Generate where derivable**: if the `webmcp` plugin is present, we _can_ emit a
    `.well-known` MCP server card (`application/mcp-server-card+json`) from its
    `ModelContextContainer`/`ToolDescriptor` set — which is also exactly what an `ard.json`
    entry's `url` points at. Optional second step; folds into the Q7 scaffold.
- **`ard.json` — warn + agent authors it; default to NOT auto-generating.** (User decision:
  "warn if no ard.json, and require the agent to create one. I am not sure we can generate it
  automatically.") **Spec pinned** ([Agentic Resource Discovery v0.91](https://agenticresourcediscovery.org/spec),
  [schema](https://github.com/ards-project/ard-spec/blob/main/spec/schemas/ard-entry.schema.json)):
  - **Path**: `/.well-known/ard.json` (current) — **couples it with the `.well-known` fix above**;
    the presence check targets `public/.well-known/ard.json`.
  - **Predecessor path `/.well-known/ai-catalog.json` → serve as alias** (user decision): the
    [specification.website ARD page](https://specification.website/spec/agent-readiness/agentic-resource-discovery/)
    still lists the older `ai-catalog.json` path; ARD moved it to `ard.json`. To stay legible to
    clients expecting either, **also serve `ai-catalog.json`** as a redirect/alias/copy of
    `ard.json`. Simplest: the creation/scaffold step writes **both files** (copy), so the
    `.well-known` serving fix covers them with no redirect logic. Validation treats `ard.json` as
    canonical; a present-but-mismatched `ai-catalog.json` is a warning.
  - **Shape**: `{ entries: ArdEntry[] }`. Each entry **requires** `identifier` (URN, pattern
    `^urn:air:<publisher>:<namespace>:<name>$`), `displayName`, `type` (an IANA media type, e.g.
    `application/mcp-server-card+json`), and **exactly one of** `url` | `data`. SHOULD carry
    `representativeQueries` (2–5). Optional: `description`, `capabilities`, `tags`, `version`,
    `updatedAt`, `metadata`, `@context`/`@id`, `TrustManifest`.
  - Add a validation **warning** when `public/.well-known/ard.json` is absent (mirror the
    robots.txt check at `validate.ts:2274`); when present, validate against the ARD schema.
  - **Agent-kit guide** carries the schema + a worked example and instructs the agent to author
    it. ⚠️ v0.91 is "Proposal" status (dated Aug 26 2026) — a moving target; pin the version.
  - **Now-feasible (open, Q7)**: a _hybrid scaffold_ — derive `identifier`/`type`/`url` entries
    from `.jay-action` (DL#215) + `webmcp` descriptors, author enriches the editorial fields.
    Keeps the user's "author owns it" default while removing the blank-page cost. Decide in impl.
- **Each generated file gets a paired validation** (prevention): present + well-formed, and
  a report-only nudge when `site.baseUrl`/`site.name` is unset so the files are complete.
  The two author-responsibility files (`.well-known/*`, `ard.json`) get **presence warnings**,
  not generators.
- **Null hypothesis**: everything derives from the **existing** `RouteManifest` (patterns,
  instances, `headMeta` title/description, `noIndex`, `devOnly`) and `.jay` `site` config —
  **no new per-page authoring surface**. This is pure build-time projection of data we
  already have.

---

## Background

Agents discover a site through a small set of conventional files at known paths: `robots.txt`
(crawl policy + sitemap pointer), `llms.txt` (a curated, markdown index of the site for
LLMs), and emerging `/.well-known/` manifests (agent/tool capability cards). Jay already
emits `sitemap.xml` from the route manifest at build; these files are the same kind of
derived, build-time artifact.

## Problem

Per the ora scan, `jay-framework.dev` ships none of `llms.txt`, a `/.well-known` agent
manifest, or `ard.json`, and its `robots.txt` is author-optional (framework only validates
presence). An agent landing on a Jay site has the sitemap but no LLM-oriented index and no
capability manifest, costing the Discovery category.

## Prior Art / Adjacent Mechanisms (verified)

| Mechanism                      | Where                                                                                       | Relation                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Sitemap generation             | `generate-sitemap.ts` → `generateSitemap(manifest, baseUrl, path)`                          | ✅ exact precedent: build-time file from manifest + baseUrl                                                    |
| Sitemap call sites             | `build-pipeline.ts:657`, `rebuild.ts:155`                                                   | the two homes for the new emission step                                                                        |
| robots.txt validation          | `validate.ts:2274` (warn if `public/robots.txt` missing)                                    | ⚠️ validate-only — upgrade to generate-if-absent                                                               |
| Dev "don't clobber" convention | `server.ts:53` (serve placeholder only if no static `sitemap.xml`)                          | pattern for "generate only when author hasn't provided"                                                        |
| `RouteManifest` / `RouteEntry` | `production-server/lib/types.ts` (`pattern`, `instances`, `headMeta`, `noIndex`, `devOnly`) | ✅ supplies titles/descriptions/URLs for llms.txt                                                              |
| `.jay` `site` config           | `stack-cli/lib/config.ts` (`baseUrl`; `name`/`description` added in #213)                   | site name/summary for llms.txt H1 + robots Sitemap line                                                        |
| webmcp tool descriptors        | `packages/plugins/webmcp` (`ToolDescriptor`, `ModelContextContainer`)                       | candidate source for a `.well-known` agent/tool card                                                           |
| **Dev** static serving         | `stack-cli/lib/server.ts:66` — `express.static(publicPath)` (no opts)                       | ❌ Express default `dotfiles: 'ignore'` ⇒ `/.well-known/*` **404s in dev**                                     |
| **Prod** static serving        | `production-server/lib/serve/fetch-static-handler.ts` (`fetchStaticFile`)                   | ✅ no dotfile filter; `.json`→`application/json` ⇒ serves `/.well-known/*` if the file reached the served root |

**Load-bearing claims:**

- ✅ verified — `generateSitemap` is invoked at `build-pipeline.ts:657` and `rebuild.ts:155`
  with `(manifest, siteBaseUrl, sitemapPath)`; new emitters slot in beside both.
- ✅ verified — `RouteEntry` carries `headMeta` (title/meta), `noIndex`, `devOnly`, `pattern`,
  `instances[].params` — enough to build a titled, filtered link index.
- ✅ verified — robots.txt is validated, not generated (`validate.ts:2274`).
- ✅ verified — **dev/prod `.well-known` inconsistency**: dev `express.static(publicPath)` has
  no options object (default `dotfiles: 'ignore'`) so dotdirs 404; prod `fetchStaticFile`
  applies no dotfile filter and resolves `.json` to `application/json`, so it serves them.
- ✅ verified — the build's public-copy preserves dotdirs: `build-pipeline.ts:648` uses
  `fs.cp(publicFolder, frontendDir, { recursive: true })` (no dotfile filter), so
  `public/.well-known/**` lands in the served root. **Prod path is fully clear; dev is the only gap.**
- ✅ pinned (external spec) — `ard.json` lives at `/.well-known/ard.json`; shape is
  `{ entries: ArdEntry[] }` with each entry requiring `identifier` (URN `^urn:air:…$`),
  `displayName`, `type` (IANA media type) and exactly one of `url`/`data`
  ([ARD v0.91](https://agenticresourcediscovery.org/spec);
  [JSON Schema](https://github.com/ards-project/ard-spec/blob/main/spec/schemas/ard-entry.schema.json)).
- ⚠️ risk — ARD is v0.91 "Proposal" (Aug 26 2026), not yet stable; pin the version and expect churn.

## Questions and Answers

**Q1. Generate `llms.txt` or `llms-full.txt`?**
A. Start with `llms.txt` (the index: links + descriptions). `llms-full.txt` (inlined page
content) is a heavier follow-up — the content already exists in the slow-phase cache, so it's
feasible later, but defer to keep #214 small.

**Q2. What if the author ships their own `llms.txt`/`robots.txt` in `public/`?**
A. Author file wins — generate only when absent (sitemap convention). Never overwrite.

**Q3. Should `.well-known` and `ard.json` block this DL?**
A. No — but the stance changed (user direction). We do **not** defer `.well-known`: it's
critical web infra and Jay must _serve the path reliably_, which is a concrete framework fix
(see Q5), not a format invention. For `ard.json` we **warn if absent and require the agent to
author it** — we do not auto-generate it (the schema is ora-specific and unconfirmed). What's
still gated on spec confirmation is only the _optional_ generated `.well-known` agent card
from `webmcp` descriptors. We still **never invent a manifest format we'd write ourselves**.

**Q4. Where do the files land?**
A. The production output/public dir, same place `sitemap.xml` is written, so the server
serves them at `/llms.txt`, `/robots.txt`, `/.well-known/...`.

**Q5. Why is `.well-known` a framework change and not just author content?**
A. Because Jay's dev server won't serve it today. `stack-cli/lib/server.ts:66` mounts
`express.static(publicPath)` with no options, and Express defaults `dotfiles: 'ignore'` — so
an author who drops `public/.well-known/ard.json` gets a 404 in dev while prod (custom
`fetchStaticFile`, no dotfile filter) serves it. Supporting `.well-known` = (1) make dev serve
the dotdir (`express.static(publicPath, { dotfiles: 'allow' })`, or a scoped mount for
`/.well-known`), and (2) verify the build's public-copy preserves dotdirs into the served
root. After that, author/plugin `.well-known/*` files "just work" at both dev and prod.

**Q6. Can't we auto-generate `ard.json`?**
A. Default: no — author/agent owns it (user's call). But now the schema is pinned, the
_structure_ IS derivable even if the _content_ isn't fully: an entry is `{identifier, type,
url}` + editorial fields. The required/mechanical trio maps onto data we already hold (actions,
webmcp cards); only `displayName`/`description`/`representativeQueries`/`tags` need a human.
Hence Q7's hybrid, not full auto-generation.

**Q7 (OPEN — decide in impl). Scaffold `ard.json` from actions + webmcp, or warn-only?**
A. Two options, user default = B:

- **A (hybrid scaffold)**: generate a starter `/.well-known/ard.json` with one entry per
  exposed `.jay-action` (DL#215) / `webmcp` tool card — fills `identifier` (URN from
  publisher+action name), `type` (`application/mcp-server-card+json`), `url` (the action
  endpoint / card). Author enriches editorial fields. Generate-if-absent (never clobber).
- **B (warn-only)**: no generation; validation warns on absence, agent-kit guide drives
  authoring. Matches the user's stated decision.
  Recommendation: ship **B** now; keep **A** as a fast follow once DL#215's action metadata
  lands (its `ActionMetadata` is the exact source for the scaffold). Avoids coupling #214 to
  #215's timeline.

## Design

### llms.txt (from manifest)

```
# <site.name>

> <site.description>

## Pages
- [<title>](<baseUrl><url>): <description>
...
```

- Iterate `manifest.routes`, skip `devOnly` and `noIndex`.
- For each indexable instance URL (reuse `buildUrlFromManifest`), pull `title`/`description`
  from `headMeta` (static parts; bound `{…}` resolved against the instance's slow ViewState
  where available, else omitted).
- Group by top-level path segment into `##` sections when there are many routes.

### robots.txt (generate-if-absent)

```
User-agent: *
Allow: /
Sitemap: <site.baseUrl>/sitemap.xml
```

- Only written if `public/robots.txt` absent (author file wins).
- `Sitemap:` line only when `site.baseUrl` is set; otherwise omit the line (and the existing
  validation warning still fires).

### .well-known (serve the path — framework fix)

The deliverable here is **reliable serving**, not a generated file:

1. **Dev**: change `server.ts:66` from `express.static(publicPath)` to
   `express.static(publicPath, { dotfiles: 'allow' })` (or add a scoped mount for
   `/.well-known`). Verified gap — without this, `public/.well-known/*` 404s in dev.
2. **Build copy**: ✅ already preserves dotdirs — `build-pipeline.ts:648`
   `fs.cp(publicFolder, frontendDir, { recursive: true })` copies `.well-known/**`. No change.
3. **Prod**: already serves (`fetchStaticFile`, no dotfile filter) — no change.

After this, any `.well-known/*` file an author or plugin places in `public/` is served at
`/.well-known/*` in both dev and prod.

**Optional generated agent card (gated on spec):** when the `webmcp` plugin is present, we may
emit a `.well-known` capability card from its `ModelContextContainer`/`ToolDescriptor` set.
This is a second step, gated on confirming the target filename/schema against the ora rubric —
**no format invention**.

### ard.json (warn + agent authors it — default no generator)

`/.well-known/ard.json` — [ARD v0.91](https://agenticresourcediscovery.org/spec). Shape:

```text
{
  "entries": [
    {
      "identifier": "urn:air:<publisher>:<namespace>:<name>",   // required, pattern ^urn:air:…$
      "displayName": "Weather Data Node",                         // required
      "type": "application/mcp-server-card+json",                 // required, IANA media type
      "url": "https://api.example.com/mcp/weather.json",          // required: exactly one of url|data
      "representativeQueries": ["…", "…"],                        // SHOULD (2–5)
      "description": "…", "capabilities": ["…"], "tags": ["…"]    // optional, feed the semantic index
    }
  ]
}
```

`ard.json` is **author/agent responsibility**, not generated by default (user decision). The
framework's job is a nudge + a correctness check, not the file's content:

- **Validation warning** when `public/.well-known/ard.json` is absent — mirror the robots.txt
  presence check at `validate.ts:2274`. (Depends on the `.well-known` serving fix above.)
- When present, **validate against the ARD JSON Schema** (bundle the pinned v0.91 schema): JSON
  well-formedness, `entries` array, each entry's required fields + URN pattern + `oneOf` url/data.
  Report a warning (not error) on entries missing `representativeQueries` (SHOULD, agents won't
  find them otherwise) — mirrors ARD's own conformance-warning semantics.
- The **agent-kit guide** carries the schema + worked example and tells the agent to author it,
  pinned to the v0.91 version.
- **Predecessor alias** (user decision): ARD's older path is `/.well-known/ai-catalog.json`
  (still listed by specification.website). To serve clients expecting either name, publish
  **both** — the author/scaffold writes `ard.json` and a copy at `ai-catalog.json` (a plain copy
  needs no redirect logic and rides the same `.well-known` serving fix). `ard.json` is canonical;
  if only `ai-catalog.json` is present, warn to add/rename to `ard.json`; if both are present but
  differ, warn.

**Hybrid scaffold (Q7, optional):** emit a starter `/.well-known/ard.json` whose entries are
derived from the exposed `.jay-action` set (DL#215) and `webmcp` tool cards — fill
`identifier`/`type`/`url`, leave editorial fields for the author. Still "author owns it" (we
only scaffold, never overwrite an author file), but removes the blank page. Decide in impl.

### Validation

- **Presence warnings** (prevention, mirror `validate.ts:2274`): missing `public/robots.txt`
  (already exists), missing `public/ard.json`.
- **Well-formedness**: if `ard.json` is present, error on invalid JSON.
- **Report-only**: `llms.txt`/`robots.txt` not generated because `site.name`/`site.baseUrl`
  unset (so the author knows why the file is absent/incomplete).

## Implementation Plan

1. **`llms.txt` generator** beside `generateSitemap` (new `generate-llms-txt.ts`), wired into
   both call sites; fixture asserting the generated file against a manifest with mixed
   static/dynamic/noIndex/devOnly routes.
2. **`robots.txt` generate-if-absent** at the same step; fixture for absent vs author-provided.
3. **`.well-known` serving fix** (framework, dev only): dev `express.static(publicPath,
{ dotfiles: 'allow' })` at `server.ts:66` (prod + build-copy already handle it); test that a
   `public/.well-known/x.json` fixture is served in both dev and prod.
4. **`ard.json` validation**: presence warning on missing `public/.well-known/ard.json` (mirror
   `validate.ts:2274`); when present, validate against the **bundled ARD v0.91 JSON Schema**
   (`entries`, per-entry required fields, URN pattern, `oneOf` url/data) + a SHOULD-warning for
   missing `representativeQueries`. **No generator (option B).** Also handle the predecessor
   **`ai-catalog.json` alias**: canonical is `ard.json`; warn if only `ai-catalog.json` exists or
   if both exist and differ (agent-kit instructs authoring `ard.json` + a copy at `ai-catalog.json`).
5. **Validation nudges** for unset `site.name`/`baseUrl`.
6. **(Deferred, Q7/A)** optional hybrid `ard.json` scaffold from `.jay-action` + `webmcp` cards
   — fast-follow after DL#215; not in the first cut.
7. **Agent-kit**: (a) `llms.txt`/`robots.txt` are generated (authors override via `public/`);
   (b) **the agent must author `/.well-known/ard.json`** — embed the pinned v0.91 schema +
   worked example + the URN format; (c) `.well-known/*` files placed in `public/` are now served
   at both dev and prod.

## Verification criteria

- A built project with `site.name`+`baseUrl` ships `/llms.txt` listing every indexable page
  with title + description, and a `/robots.txt` with the `Sitemap:` line.
- An author-provided `public/robots.txt`/`llms.txt` is preserved untouched.
- A `public/.well-known/x.json` fixture is served at `/.well-known/x.json` in **both** dev and
  production (regression test for the dotfiles gap).
- A project missing `/.well-known/ard.json` gets a validation warning; an `ard.json` that
  violates the ARD v0.91 schema (bad URN, missing required field, both/neither url/data) fails
  validation.
- A re-scan recovers the agent-discovery-file Discovery checks.

## Trade-offs

- **Generate-if-absent vs always-generate**: generate-if-absent respects author intent and
  matches the sitemap convention, at the cost of a slightly more complex emit step. Right call.
- **Serve `.well-known` vs generate it**: fixing the serving path is a small, correct-by-
  construction change that unblocks _any_ `.well-known` file (author- or plugin-authored),
  without betting on a single format. The optional generated agent card stays gated on spec.
- **Warn-for `ard.json` vs generate it**: presence-warn + validate-if-present + agent-authored
  keeps the ARD schema in author-facing docs where it can track the spec without a framework
  release — important because **ARD is v0.91 "Proposal" (Aug 26 2026), not stable**. Pinning a
  moving schema into a generator would invite churn; validating against a pinned-version bundled
  schema is cheaper to bump. Cost: authors must act on the warning (agent-kit makes it default).
  The Q7 hybrid scaffold is the escape hatch if the blank-page cost proves too high.

## Scope — what #214 does NOT do

- `llms-full.txt` (inlined content) → follow-up (Q1).
- **Full auto-generation of `ard.json`** → out (user decision); first cut is warn + validate +
  agent authors it. The **hybrid scaffold** (Q7/A) is a deferred fast-follow after DL#215.
- The **optional** generated `.well-known` MCP server card → folds into Q7/A (same source).
- Adopting a specific `.well-known` suffix beyond `ard.json` (e.g. `security.txt`,
  `openid-configuration`) → not generated; the serving fix lets authors drop any of them in.
- **Agent-skills publishing** (`/.well-known/agent-skills/<name>/SKILL.md` + `index.json` whose
  entries carry a `digest`=`sha256:<hex>` + `api-catalog`/`Link` advertisement,
  agent-skills-discovery v0.2.0 — specification.website) →
  **[DL#216](216%20-%20agent-skills%20publishing.md)**. Distinct spec sharing the
  `.well-known` root + RFC 8615 base. Designed as **validation + an agent-invoked creation tool**
  (plugin), not a build generator; depends on this DL's `.well-known` serving fix.
- JSON-LD → DL#213. Action/API docs (MCP/REST exposure) → DL#215 (parked, plugin-space).

## Implementation Results

Implemented on branch `DL212-216-agent-readability-impl`. `yarn build:check-types` passes; all new tests green.

### llms.txt (plan item 1)

- `production-server/lib/builder/generate-llms-txt.ts` (new): `generateLlmsTxt(manifest, site, backendDir, outputPath)`. Skips `devOnly`/`noIndex`; for each instance loads the slow ViewState from `backendDir/<instance.cachePath>` and resolves `headMeta` via `headMetaToHeadTags` to get the real `<title>`/`<meta description>` (bound `{…}` that can't resolve is dropped, never emitted literally). Grouped into `##` sections by top-level path segment. Requires `site.name` (the H1).
- Wired at **both** call sites: `production-build/build-pipeline.ts` (generate-if-absent — `public/llms.txt` wins) and `production-server/invalidation/rebuild.ts` (regenerates unconditionally, like the sitemap; needs `site` threaded — added `RebuildOptions.site`, passed from `run-production.ts`).
- Tests: `production-server/test/generate-llms-txt.test.ts` (2) — grouped index with resolved bound titles, devOnly/noIndex skipped.

### robots.txt (plan item 2)

- `production-server/lib/builder/generate-robots-txt.ts` (new): `generateRobotsTxtIfAbsent(outputPath, baseUrl)` — writes default allow-all + `Sitemap:` line (only when `baseUrl` set); returns false without clobbering an author file. Wired into `build-pipeline.ts` after the public/ copy (so an author `public/robots.txt` already present is respected).
- Tests: `production-server/test/generate-robots-txt.test.ts` (3).

### .well-known serving fix (plan item 3)

- `stack-cli/lib/server.ts`: dev static mount → `express.static(publicPath, { dotfiles: 'allow' })`. Prod + build-copy already handled dotdirs (verified in design); no change there.
- Tests: `stack-cli/test/well-known-serving.test.ts` (2) — locks in that `dotfiles:'allow'` serves `/.well-known/*` and the Express default 404s it.

### ard.json validation (plan item 4, option B — no generator)

- `stack-cli/lib/validate-ard.ts` (new): `validateArdDocument(doc)` structurally validates the ARD v0.91 shape (entries array; per-entry URN `identifier`, `displayName`, IANA-media-type `type`, exactly-one-of `url`/`data`; `representativeQueries` 2–5 = SHOULD → warning). `checkArdFiles(projectRoot)` handles the `ai-catalog.json` alias (canonical `ard.json`; warn if only alias / if both differ) and reports absence. Validated structurally rather than bundling a JSON-Schema validator dependency (v0.91 is a moving target; rules are small and explicit).
- Wired into `validate.ts` project-level section (beside the robots.txt/site.baseUrl checks): absence → warning; present → errors/warnings from the validator.
- Tests: `stack-cli/test/validate-ard.test.ts` (7).

### Validation nudges (plan item 5)

- `site.name` absent warning (added in #213) extended to mention llms.txt. `site.baseUrl` absent warning already existed (sitemap).

### agent-kit (plan item 7)

- `developer/seo-guide.md`: new "Agent-Discovery Files (DL#214)" section — the generated-files table (sitemap/llms.txt/robots.txt + override-via-public), the `.well-known`-just-works note, and the **author-it** `ard.json` guide with the pinned v0.91 schema, a worked example, the URN format, and the `ai-catalog.json` alias instruction.

### Deferred (as designed)

- **Q7/A hybrid `ard.json` scaffold** from `.jay-action` + `webmcp` cards → fast-follow after DL#215 (not in first cut).
- Optional generated `.well-known` MCP server card → same (folds into Q7/A).
- `llms-full.txt` → follow-up (Q1).

### Deviations from design

- `RebuildOptions` gained a `site?` field (design only mentioned `siteBaseUrl`) so rebuild can regenerate llms.txt with the H1/description. Minor, additive.
- llms.txt on **rebuild** regenerates unconditionally (parallel to the sitemap), so a rebuild will overwrite an author `public/llms.txt`. Build-time generation still respects the author file. Acceptable (rebuild is for generated content); noted here as a known limitation.

### Follow-up — `allow-no-ard` suppression (2026-10-11)

While fixing validation in `examples/jay-stack/fake-shop`, the ARD absent **nudge** had no escape
hatch: a site with no agent-callable resources (e.g. the fake-shop, whose only agent surface is the
in-page WebMCP plugin — no served server-card URL) was stuck with a permanent warning.

**Where the suppression lives (reviewed decision).** First cut mirrored the DL#200 composition
overrides — `allow-no-ard: true` in a page's `application/jay-validations` script, read from any page
and applied project-wide. Review flagged a scope mismatch: unlike `allow-no-template` /
`allow-no-design-system` (which are *about* page/region composition), `allow-no-ard` governs a single
**project-level file** (`public/.well-known/ard.json`), so pinning it to an arbitrary page is wrong
(which page? and it silently vanishes if that page is deleted). Moved it to **`.jay`** under a new
`validations:` section — a project-level file governs a project-level concern. Page/region overrides
stay in `application/jay-validations`; project-file overrides go in `.jay`. The split is by *scope of
the thing suppressed*, not by one uniform mechanism.

- `config.ts`: `JayConfig.validations?: { 'allow-no-ard'?: boolean }`; `loadConfig` passes it through.
- `validate.ts`: `allowNoArd = config.validations?.['allow-no-ard'] === true` gates the absent-warning.
- Docs: `developer/seo-guide.md` ARD section. Tests:
  `stack-cli/test/validate-ard-suppression.test.ts` (2 — warns when absent + unset; silent when the
  `ard-suppressed` fixture ships a `.jay`).
- The fake-shop now sets `validations: { allow-no-ard: true }` in `.jay` (+ `site.name`/`logo`/
  `description`, which clears the JSON-LD/llms.txt nudge from #213/#214).
