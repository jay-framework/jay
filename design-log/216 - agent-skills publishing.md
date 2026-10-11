# DL#216 — Agent-skills publishing (validate + agent tool)

**Status: [Design]** — child of [DL#214](214%20-%20agent-discovery%20files.md), grandchild of
[DL#212](212%20-%20agent-readability%20of%20generated%20sites.md). Publishes agent skills at
`/.well-known/agent-skills/` per the agent-skills-discovery spec v0.2.0
([specification.website](https://specification.website/spec/agent-readiness/agent-skills-discovery.md),
schema host `schemas.agentskills.io`), using **validation + an agent-invoked creation tool** —
not a build-time generator.

---

## Decisions for the Implementer (TL;DR)

- **No standing build generator. Prevention-first ladder instead** (CLAUDE.md): (1) a
  **validation** that the `/.well-known/agent-skills/` structure exists, is well-formed, and its
  **sha256 digests match the served files**; (2) an **agent-invoked tool** that creates/updates
  that structure on demand. The author (or the dev-time agent) owns the content; the tool does
  the mechanical packaging + digests; validation catches drift. Mirrors the `ard.json` decision
  in DL#214 (warn + agent authors), plus a concrete tool so the agent isn't starting blank.
- **Why not a build-time generator**: digests must be regenerated whenever a skill changes — a
  standing generator would recompute on every build (noise) and couple core to a non-core spec.
  A **re-run of the tool** is the fix for staleness; validation is the tripwire that says "re-run
  it." This keeps the digest-drift failure mode out of the build path.
- **Published skills ≠ authoring skills** (user decision). *Authoring* skills (`.cursor/skills/*`,
  agent-kit guides) teach a dev-time agent how to **build** a Jay site; they are consumed locally,
  never published. *Published* skills are what the built **website** exposes at
  `/.well-known/agent-skills/` for agents **consuming** the site. **Do not** default to
  `.cursor/skills`. New default source folder for published skills: **`src/skills/`** — a sibling
  of `src/pages`/`src/components`/`src/styles` (✅ verified convention: `config.ts`
  `pagesBase: './src/pages'`; wix/golf/starkdale/website all use `src/`).
- **The tool takes either a single config _or_ a folder** (user decision):
  - **Folder mode** (ergonomic default): read `src/skills/` — each subdirectory with a `SKILL.md`
    is one skill. Name/description come from the `SKILL.md` frontmatter; sibling files are
    packaged as the skill's archive. (`.cursor/skills/<name>/` is the same *layout*, but it is the
    authoring set and is **not** a default source here.)
  - **Config mode**: an explicit list of skills to publish (name, description, type, source
    path / inline body, assets) for selective/curated publishing.
- **The agent-kit must document how to publish skills — shipped by this plugin** (user). The
  skill-publishing plugin contributes agent-kit guidance: author skills under `src/skills/`, run
  the creation tool, and the validator enforces freshness. The plugin owns this guide (not core
  agent-kit), consistent with how plugins ship their own agent-kit material.
- **Delivered as a plugin** (consistent with DL#215's plugin-space decision). The plugin
  contributes: a **validator** (via the existing `runPluginValidators` hook, `validate.ts:1718`)
  and a **creation tool** (a `jay-stack` CLI command, surfaced to agents through `agent-kit`).
- **First published skill = "build a website with Jay", and it lives in the _website_, not the
  framework** (recommended). Rationale: a skill teaching how to use Jay is on-mission *content* of
  `jay-framework.dev`, and the website already ships a complete `jay-website/jay-skill.md`
  (frontmatter `name: jay`, getting-started content) ✅ verified — it just needs moving to
  `src/skills/jay/SKILL.md` and publishing via this plugin, sourced from the existing get-started
  page (`jay-website/src/pages/get-started`). **This DL does NOT author that skill** — it's noted
  as the inaugural implementation / verification vehicle, authored in the website repo.
- **Core owes only hooks** (none net-new to this DL beyond #214): the `.well-known` dev serving
  fix (DL#214) so the files serve in dev + prod; the existing plugin-validator hook; optional
  `Link: rel="agent-skills"` response-header support (skippable — `api-catalog` is a static file).
- **✅ Spec pinned (v0.2.0).** From
  [specification.website/spec/agent-readiness/agent-skills-discovery.md](https://specification.website/spec/agent-readiness/agent-skills-discovery.md):
  - `$schema` = `https://schemas.agentskills.io/discovery/0.2.0/schema.json`.
  - `index.json` = top-level `$schema` + `skills[]`; each entry has **`name`, `type`, `description`,
    `url`, `digest`** (all five required). `type` ∈ `"skill-md"` | `"archive"`. The digest field is
    named **`digest`**, value **`sha256:<hex>`** over the artifact's raw bytes — **not** a field
    called `sha256`. No `summary`/`representativeQueries`.
  - `SKILL.md` frontmatter: `name` (lowercase, hyphens, 1–64 chars) + `description` (≤1024 chars).
  - **Archive format is NOT named by the spec** — only `type: "archive"` with a `url`. We pick the
    packaging format (default `.tar.gz`) and document it; don't claim the spec mandates it.
  - Advertise via `/.well-known/api-catalog` (**RFC 9727** Linkset — the agent-skills page itself
    doesn't repeat the RFC, but the dedicated api-catalog spec pins it) +
    `Link: rel="agent-skills"; type="application/json"`.
  - Served: CORS `Access-Control-Allow-Origin: *`; `SKILL.md` as `text/markdown`; index as
    `application/json` + `200`; clients verify by refetching `url` and hashing bytes == `digest`.

---

## Background

The agent-skills-discovery spec (v0.2.0, builds on RFC 8615) lets a site publish focused agent
capabilities as `SKILL.md` files (Markdown + YAML frontmatter: `name`, `description`,
instructions), optionally packaged with assets as an `archive`-type entry. They live at a
predictable path `/.well-known/agent-skills/<name>/SKILL.md`, indexed by
`/.well-known/agent-skills/index.json` (each entry carries a `digest` = `sha256:<hex>` so clients
verify by refetching + hashing before loading), and advertised via `/.well-known/api-catalog` +
a `Link: rel="agent-skills"; type="application/json"` header. Served with CORS open
(`Access-Control-Allow-Origin: *`); `SKILL.md` as `text/markdown`, index as `application/json`.

Jay already authors `SKILL.md` in exactly this shape (`.cursor/skills/*/SKILL.md`), so the gap
is publishing them at the well-known path with a valid, digest-verified index — not authoring.

## Problem

DL#214 covers `llms.txt`/`robots.txt`/`ard.json` and the `.well-known` serving fix, but **not**
agent-skills publishing (a distinct spec). Nothing in Jay emits or validates the
`/.well-known/agent-skills/` structure. Hand-maintaining `index.json` + sha256 digests is
error-prone: the digests silently go stale whenever a `SKILL.md` or asset changes, and a wrong
digest makes a compliant client **refuse** the skill — a failure invisible to human review.

## Prior Art / Adjacent Mechanisms (verified)

| Mechanism | Where | Relation |
| --------- | ----- | -------- |
| `ard.json` = warn + agent authors (DL#214) | DL#214 `ard.json` section | ✅ same philosophy; this adds a creation tool + digest validation |
| `.well-known` dev serving fix (DL#214) | `stack-cli/lib/server.ts:66` (dotfiles) | ✅ prerequisite — serves the published files in dev (prod already serves) |
| Plugin-contributed validators | `stack-cli/lib/validate.ts:1718` `runPluginValidators` (called :2398) | ✅ the validation half plugs in here |
| Existing validation precedent (presence) | `validate.ts:2274` (robots.txt presence warn) | pattern for "file absent" warning |
| CLI command surface (commander) | `stack-cli/lib/cli.ts` (`.command('agent-kit')`, `run-agent-kit.ts`) | ✅ where the creation tool lands; agent-kit surfaces it to agents |
| `SKILL.md` format precedent | `.cursor/skills/*/SKILL.md` (6 skills, `name`+`description`) — **authoring** set | ✅ same format; but these are authoring aids, **not** a default published source |
| `src/` project convention | `config.ts` `pagesBase: './src/pages'`; wix/golf/starkdale/website use `src/` | ✅ basis for the `src/skills/` published-source default |
| Website already drafts a skill | `jay-website/jay-skill.md` (full `SKILL.md`), `jay-website/src/pages/get-started` | ✅ the inaugural published skill's home + source (website repo) |
| webmcp plugin | `packages/plugins/webmcp` | precedent for an agent-surface plugin |
| Prod static serving (dotdirs) | `fetch-static-handler.ts`; build copy `fs.cp(..., {recursive:true})` (DL#214) | ✅ serves `.well-known/**` in prod end-to-end |

**Load-bearing claims:**
- ✅ verified — plugins contribute validators through `runPluginValidators` (`validate.ts:1718`,
  invoked at `:2398`).
- ✅ verified — stack-cli is commander-based with an `agent-kit` command; a new creation command
  slots in and can be advertised via agent-kit.
- ✅ verified — `SKILL.md` with `name`/`description` frontmatter already exists (authoring set
  `.cursor/skills/*`; and the website's `jay-website/jay-skill.md`).
- ✅ verified — Jay's `src/` convention (`config.ts` `pagesBase: './src/pages'`) → `src/skills/`
  is the natural published-skills source default.
- ✅ verified (spec v0.2.0, pinned from specification.website) — `$schema` =
  `https://schemas.agentskills.io/discovery/0.2.0/schema.json`; entry fields `name`/`type`/
  `description`/`url`/`digest` (digest = `sha256:<hex>`, **not** a `sha256` field);
  `SKILL.md` frontmatter `name`+`description`; advertise via `api-catalog` (RFC 9727) + `Link`
  header; CORS-open served output. **Archive packaging format is not named by the spec** (we
  choose it).

## Questions and Answers

**Q1 (RESOLVED). What is the authoritative v0.2.0 spec URL?**
A. [specification.website/spec/agent-readiness/agent-skills-discovery.md](https://specification.website/spec/agent-readiness/agent-skills-discovery.md),
schema host `schemas.agentskills.io`. Pinned facts (see TL;DR / load-bearing claims): `$schema` =
`https://schemas.agentskills.io/discovery/0.2.0/schema.json`; entry fields `name`/`type`/
`description`/`url`/`digest`. **Correction to the earlier assumption**: the digest field is named
**`digest`** (value `sha256:<hex>`), not `sha256`; and the agent-skills page does **not** name an
archive format (we choose `.tar.gz`). `api-catalog` = RFC 9727 per its own spec page.

**Q2. Folder vs config — both?**
A. Both (user decision). Folder mode is the default and reads **`src/skills/`** (each
`SKILL.md`-bearing subdir = a skill; frontmatter supplies name/description; siblings packaged into
the archive). Config mode lists skills explicitly for curated/selective publishing. One tool, two
input modes.

**Q7. Published skills vs authoring skills — what's the default source folder?**
A. They are different concerns (user decision). *Authoring* skills (`.cursor/skills/*`, agent-kit
role guides) are dev-time, local, never published. *Published* skills are a build output of the
**website**. The default published-skills source is **`src/skills/`** — a sibling of
`src/pages`/`src/components`/`src/styles` (✅ verified `src/` convention). We deliberately do **not**
read `.cursor/skills` as a default: those are the framework/project's own authoring aids, not the
site's public agent surface.

**Q8 (user-flagged). The "build a website with Jay" skill — framework or website?**
A. **Website.** It's content teaching how to use Jay — on-mission for `jay-framework.dev`, which
already ships `jay-website/jay-skill.md` (a complete `SKILL.md`, ✅ verified) and whose
get-started page (`jay-website/src/pages/get-started`) is its source. The *framework* already
ships authoring aids (agent-kit, `.cursor/skills`) consumed at dev-time; it does not publish
skills at a URL. So this skill is authored in the **website repo** (move `jay-skill.md` →
`src/skills/jay/SKILL.md`, publish via this plugin). **Not authored in this DL** — noted as the
first implementation.

**Q3. Is the creation tool a runtime action, a CLI command, or an agent-kit script?**
A. A **CLI command** (author/build-time; it writes `public/.well-known/**` and hashes files) —
**not** a runtime action (actions are RPC with no filesystem/public access, DL#215). Surface it
through `agent-kit` so the dev-time agent discovers and invokes it.

**Q4. What does the validator check?**
A. (1) presence of `/.well-known/agent-skills/index.json`; (2) `index.json` is valid JSON with
`$schema` set + a `skills[]` array whose entries carry `name`/`type`/`description`/`url`/`digest`;
(3) each referenced `SKILL.md`/archive exists and each `SKILL.md` has `name`+`description`
frontmatter (name lowercase/hyphen/1–64, description ≤1024); (4) **each entry's `digest`
(`sha256:<hex>`) matches the served file's bytes** (the drift catcher); (5) report-only:
`api-catalog`/`Link` advertisement present.
Severity: missing index → warning (like robots.txt); digest mismatch / invalid schema → error.

**Q5. Does the "index served 200 + application/json" check belong here?**
A. That's a served-output assertion — fits Tier 2 (`check-build-output`, DL#211) or a live test,
not source validation. Keep the source-time validator (Q4) primary; add the served check as a
secondary Tier-2 item once the serving fix (DL#214) lands.

**Q6. Core or plugin home?**
A. Plugin — consistent with DL#215. The transform operates on an authored skills folder with no
dependency on core build internals; validation plugs into the existing plugin-validator hook.
Core only owes the `.well-known` serving fix (DL#214) and (optionally) `Link`-header support.

## Design

### Inputs
- **Folder mode** (default): `--folder <dir>` defaulting to **`src/skills/`** — each
  `<dir>/<name>/SKILL.md` → one skill; sibling files → the skill's archive; `name`/`description`
  read from frontmatter. (Published-skills source, distinct from authoring `.cursor/skills`.)
- **Config mode**: `--config <file>` — explicit `skills[]` (name, description, type, source,
  assets) for curated publishing.

### Creation tool (CLI, surfaced via agent-kit)
`jay-stack <publish-skills>` (exact name per impl):
1. Resolve skills from folder/config.
2. For each skill: place/copy `SKILL.md` at `public/.well-known/agent-skills/<name>/SKILL.md`
   (served `text/markdown`); if it has assets, package `SKILL.md` + assets into an archive
   (`type: "archive"`; format our choice — default `.tar.gz`, spec doesn't mandate one).
3. Compute `digest` = `sha256:<hex>` over each served artifact's raw bytes (freshly, every run →
   fixes staleness).
4. Emit `public/.well-known/agent-skills/index.json`: `$schema` =
   `https://schemas.agentskills.io/discovery/0.2.0/schema.json`; `skills[]` with
   `name`/`type`/`description`/`url`/`digest`.
5. Emit/update `public/.well-known/api-catalog` advertising the index; document the optional
   `Link: rel="agent-skills"; type="application/json"` header. Ensure served output is CORS-open
   (`Access-Control-Allow-Origin: *`) and the index is `application/json`.
Idempotent; never clobbers author-authored `SKILL.md` content in folder mode (only (re)packages
+ reindexes).

### Validator (plugin-contributed, via `runPluginValidators`)
Checks Q4; errors on digest mismatch / invalid index, warns on absent index / missing
advertisement. This is the tripwire that tells the agent to re-run the tool.

### Agent-kit guidance (shipped by this plugin)
The plugin contributes an agent-kit guide (not core agent-kit) describing the publish workflow:
author skills under `src/skills/<name>/SKILL.md`, run the creation tool, and let the validator
enforce freshness. It states the published-vs-authoring distinction so a dev-time agent doesn't
confuse `.cursor/skills` (authoring) with `src/skills` (published). This is how an agent learns to
publish skills at all — the guide is part of the plugin's deliverable.

### First published skill (website repo — not authored here)
The inaugural skill is "build a website with Jay", sourced from `jay-website/src/pages/get-started`
and the existing `jay-website/jay-skill.md`. It is authored in the **website repo** as
`src/skills/jay/SKILL.md` and published via this plugin — the first real exercise of the mechanism
and a verification vehicle. Out of scope to author in this DL.

### Core support (shared, not net-new here)
- `.well-known` dev serving fix (DL#214) — prerequisite.
- Optional `Link` response-header hook (`main-server.ts:43` already copies Response headers).

## Implementation Plan

1. **Spec pinned (Q1 resolved)** — `$schema`, `index.json` fields (`digest` not `sha256`),
   `SKILL.md` frontmatter, advertisement, CORS/content-type. Archive format is our choice.
2. **Creation CLI** (folder + config modes): resolve → package → hash → emit index + api-catalog.
   Fixture: a skills folder (with + without assets) → asserted `index.json` + digests.
3. **Validator** via `runPluginValidators`: presence + schema + digest-match + frontmatter.
   Fixtures: valid set; stale-digest; missing-index; malformed `SKILL.md`.
4. **agent-kit guide (plugin-owned)**: document the publish workflow — author under `src/skills/`,
   run the creation tool, validator enforces freshness — including the published-vs-authoring
   distinction. This is a required deliverable of the plugin (user).
   - **First skill (website repo, separate task)**: move `jay-website/jay-skill.md` →
     `src/skills/jay/SKILL.md`, refresh from `src/pages/get-started`, publish via the tool.
5. **(Tier 2, after DL#214 serving fix)** served-output check: index returns 200 +
   `application/json`; artifacts reachable.
6. **Optional** `Link` header support if advertisement-by-header is wanted beyond `api-catalog`.

## Verification criteria

- Running the tool on a skills folder produces a spec-valid `index.json` whose `digest`
  (`sha256:<hex>`) values match the emitted artifacts, served at `/.well-known/agent-skills/`
  (CORS-open, index `application/json`) in dev + prod.
- Changing a `SKILL.md` and **not** re-running the tool makes validation fail (digest mismatch).
- Re-running the tool clears the failure.
- A re-scan recovers the agent-skills discovery checks.

## Trade-offs

- **Validate + tool vs build generator**: keeps a non-core spec out of the build path and makes
  staleness a loud, fixable validation error rather than silent build output. Cost: the author/
  agent must re-run the tool after editing skills — which the validator enforces.
- **Plugin vs core**: consistent with DL#215; core stays lean. Cost: the plugin must be present
  for the capability (acceptable — it's opt-in by nature).
- **⚠️ v0.2.0 is early** — like `ard.json`, expect churn; pin the version and keep the schema in
  the tool/validator where it's cheap to bump.

## Scope — what #216 does NOT do

- A build-time auto-generator (explicitly rejected in favor of validate + tool).
- `.well-known` serving (DL#214) and other `.well-known` files (`ard.json` DL#214).
- MCP/REST API exposure (DL#215, plugin-space, parked).
- Authoring skill *content* — that's the author/agent's job; the tool only packages + indexes.
- Authoring the inaugural "build a website with Jay" skill — that lives in the **website repo**
  (`src/skills/jay/SKILL.md`, from get-started); noted here, not authored here.
- Repurposing `.cursor/skills` (authoring aids) as published skills — they stay authoring-only.
