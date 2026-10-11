# DL#212 — Agent-readability of generated sites (top-level map)

**Status: [Promoted]** — this is the parent/map DL. It catalogs the gap, maps each
category to a fix, and **splits the actual work into child DLs**. No code lands from
this DL; it exists to decide _what_ we build and _where_.

---

## Decisions for the Implementer (TL;DR)

- **Trigger**: an [ora.ai](https://ora.ai/score/jay-framework.dev) agent-readability scan of
  `jay-framework.dev` scored **59/100 (Grade C)**. The question this DL answers is _not_
  "how do we fix the website" but "for each gap, **where does the fix belong** — framework
  feature, validation, agent-kit doc, or website-only content".
- **Prevention-first ordering** (CLAUDE.md): validation → agent-kit doc → framework feature.
  Most of these gaps are **missing generated output**, so the fix is usually a framework
  generator + a validation that the output exists.
- **Sequencing** (decided with the user):
  1. **JSON-LD / structured data** — simplest, highest doc-vs-generate leverage → **DL#213**.
  2. **Agent-discovery files** (`llms.txt`, `/.well-known`, `ard.json`, generated
     `robots.txt`) — cheap static emissions at build → **DL#214**.
  3. **WebMCP** — **website-only**: the framework already ships
     `packages/plugins/webmcp`; the gap is that `jay-framework.dev` doesn't _use_ it.
     No framework work. Tracked here, actioned on the website repo.
  4. **OpenAPI / server actions** — **parked** → **DL#215**. Investigation showed actions are
     not a clean OpenAPI base, and the 2026-10-11 decision is that **exposing MCP/REST is plugin
     space, not core** (core only supplies hooks). Architecture: core support + MCP plugin +
     REST plugin; `webmcp` already ships. Parked until the plugins are built.
- **Authoritative spec oracle** (added 2026-10-11): beyond the ora score, we now use
  [specification.website](https://specification.website/) — a broad, RFC-cited catalog — as the
  concrete spec oracle for agent-readiness. Its **Agent Readiness** category is enumerated and
  mapped to our DLs in the "Agent-readiness spec catalog" section below. Decision: **catalog
  only, no new DLs yet** — the table is the map; we spin DLs for candidate gaps on demand. We do
  **not** expand #212 into the site's a11y / performance / security / i18n / privacy categories
  (separate programs; a11y already scores ~100% on the ora scan).
- **Null hypothesis honored**: Jay already emits a sitemap (`generate-sitemap.ts`),
  supports canonical/OG/title/description in head-tags (DL#127/#148/#175), validates
  `robots.txt` presence (`validate.ts:2274`), and has an SEO validator plugin. The gaps
  below are the _specific_ outputs those mechanisms do **not** yet produce.

---

## Background

Jay sites are machine-facing by construction: three-phase rendering ships real HTML with
no JS required for content, and the contract/action model is already structured metadata.
That makes Jay unusually well-placed to generate agent-readability artifacts _from existing
build-time knowledge_ rather than asking authors to hand-write them.

An ora.ai scan grades a deployed site on how well AI agents can discover, access, and use
it. It is an external, concrete oracle for "is the generated output machine-legible" — the
same spirit as DL#211's build-output validation, but from outside the build.

## Problem

`jay-framework.dev` scored **59/100**. The scan's own headline: _"JAY-Framework offers
full payment processing, but lacks an OpenAPI specification."_ Category breakdown:

| Category   | Score    | Reading                                              |
| ---------- | -------- | --------------------------------------------------- |
| Discovery  | 11/20    | no JSON-LD/schema.org, no agent-discovery files     |
| Access     | 16–17/30 | **OpenAPI 0/7** — nothing generates a spec          |
| Usability  | 20–22/40 | **WebMCP 0/5**; a11y/semantic-HTML checks ~100%     |
| Payments   | 10/10    | ✅ UCP complete                                      |

Strong existing scores confirm the framework's bones are good: content-without-JS 3/3,
welcome-agents/robots/crawler access strong, a11y/semantic HTML ~100%, payments 100.
The deficits are all **missing machine-discoverable output**, not broken HTML.

## Prior Art / Adjacent Mechanisms (what already exists — verified)

| Mechanism                         | Where (verified)                                                      | Covers?                                                                 |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Sitemap generation                | `production-server/lib/builder/generate-sitemap.ts`; DL#175          | ✅ sitemap.xml emitted                                                 |
| robots.txt                        | validated only — `stack-cli/lib/validate.ts:2274` warns if missing   | ⚠️ **validated, not generated**                                        |
| Head meta: title/desc/OG/canonical | DL#127/#148/#175; `stack-server-runtime/lib/head-tags.ts`           | ✅ supported in head-tags infra                                        |
| noindex robots meta → manifest    | `production-build/lib/builder/build-pipeline.ts:450`                 | ✅ per-page robots meta flows to manifest                              |
| SEO validator (alt/h1/CLS/`<main>`) | `packages/plugins/seo-validator/lib/validators/seo-validator.ts`    | ✅ a11y/semantic HTML                                                  |
| schema.org / JSON-LD              | **agent-kit docs only** — `developer/seo-guide.md`, `plugin/seo-guide.md` | ❌ **documented, never generated**                                 |
| WebMCP bridge/tools               | `packages/plugins/webmcp` (`setupWebMCP`, `ModelContextContainer`)  | ✅ plugin exists — ❌ not used by the website; no discoverable manifest |
| OpenAPI / swagger                 | _nothing in framework code_ (verified grep)                         | ❌ absent                                                              |
| llms.txt / .well-known / ard.json | _nothing in framework code_ (verified grep)                         | ❌ absent                                                              |

**Load-bearing claims:**
- ✅ verified — no `openapi`/`swagger` anywhere in `packages/compiler` or `packages/jay-stack`.
- ✅ verified — `json-?ld`/`schema.org` appears only in the two `seo-guide.md` agent-kit docs.
- ✅ verified — no `llms.txt`/`.well-known`/`ard.json`/`agent-skills` generation anywhere.
- ✅ verified — `webmcp` is a client-side plugin (`global: true` in `plugin.yaml`); `index.ts`
  exports `init`, `setupWebMCP`, and the `ModelContext*` types.

## Category → fix map

| # | Gap (ora)                     | Fix type                     | Home     |
| - | ----------------------------- | ---------------------------- | -------- |
| 1 | JSON-LD / schema.org          | **framework generator** + validation (promote from doc → generated) | **DL#213** |
| 2 | llms.txt                      | framework generator (static) | **DL#214** |
| 3 | `/.well-known` serving        | **framework fix** (dev serves dotdirs) + optional gated generator | **DL#214** |
| 4 | ard.json                      | **validation warning + agent-kit** (agent authors it; not generated) | **DL#214** |
| 5 | robots.txt                    | upgrade validator → generator with sitemap line | **DL#214** |
| 6 | WebMCP discoverable           | **website-only** — add existing `webmcp` plugin to `jay-framework.dev` | website repo |
| 7 | OpenAPI / action docs         | **parked** — exposing MCP/REST is **plugin space, not core** (core = support only: plugin routes, action metadata, per-call auth, exposure opt-in); `webmcp` plugin already ships | **DL#215** |
| 8 | Agent-skills publishing       | validation + agent-invoked creation tool (plugin); `.well-known/agent-skills` per RFC v0.2.0 | **DL#216** |

## Agent-readiness spec catalog (specification.website)

Added 2026-10-11. The full **Agent Readiness** category from
[specification.website](https://specification.website/), mapped to our coverage. Status legend:
✅ **covered** (a DL owns it) · 🟢 **Jay-core already** · 🅿️ **parked** (#215 plugin-space) ·
🔲 **candidate gap** (no DL yet — spin on demand). **No new DLs created from this table** (user
decision); it is the scope-pre-mortem map against a real catalog.

| Agent-readiness spec | Artifact / path | Status | Owner / note |
| -------------------- | --------------- | ------ | ------------ |
| Structured data for agents | JSON-LD, schema.org | ✅ | **DL#213** |
| llms.txt (**v2**) | `/llms.txt` | ✅ | **DL#214** — confirm we target **v2** |
| llms-full.txt | `/llms-full.txt` | 🔲 | #214 Q1 defers it; candidate |
| Per-page Markdown source endpoints | `.md` / content-negotiation | 🔲 | strong fit for three-phase SSG; candidate |
| robots.txt | `/robots.txt` (RFC 9309) | ✅ | **DL#214** (generate-if-absent) |
| robots.txt for AI crawlers | named AI user-agents | 🔲 | extends #214 robots; candidate |
| Content Signals in robots.txt | search/ingest/train perms | 🔲 | extends #214 robots; candidate |
| Agent Skills discovery | `/.well-known/agent-skills/` | ✅ | **DL#216** (pinned v0.2.0) |
| Agentic Resource Discovery (ARD) | `/.well-known/ard.json` (+ `ai-catalog.json` alias) | ✅ | **DL#214** (warn + author; alias decided) |
| MCP & tool discovery | JSON-RPC MCP server | 🅿️ | **DL#215** — MCP plugin space |
| WebMCP | `navigator.modelContext` | 🟢 | `packages/plugins/webmcp` ships; website adopts |
| A2A agent cards | `/.well-known/agent-card.json` | 🔲 | plugin-space like MCP; candidate |
| auth.md — agent registration | `/auth.md` | 🔲 | ties to #215 parked API/auth work; candidate |
| HTTP Link headers for discovery | `Link:` rel advertisements | 🔲 | cross-cuts #214/#216; candidate to centralize |
| Machine-readable formats | JSON/RSS/markdown alongside HTML | 🔲 | overlaps markdown endpoints + feeds; candidate |
| Stable URLs | persistent routes | 🟢 | Jay routing principle |
| Server-side rendering | content in initial HTML | 🟢 | Jay three-phase core |
| TDM reservation (TDMRep) | header/meta/`tdmrep.json` | 🔲 | rights reservation; likely defer |
| Web Bot Auth | signed requests (RFC 9421) | 🔲 | inbound bot auth; heavy, defer |
| DNS for AI Discovery (DNS-AID) | SVCB/HTTPS DNS records | 🔲 | infra/DNS; defer |
| NLWeb | `/ask` endpoint, `rel="nlweb"` | 🔲 | conversational endpoint; defer |
| OKF bundle | OKF Markdown bundle | 🔲 | knowledge-base export; overlaps llms-full; candidate |
| Schemamap | `/schemamap.xml` → JSON-LD per resource | 🔲 | overlaps #213 JSON-LD; candidate |

**Adjacent categories, already strong (not in #212 scope):** SEO (sitemap 🟢 DL#175, canonical
🟢, meta robots 🟢, breadcrumbs 🔲 via #213), Accessibility (~100% on ora scan 🟢), plus
Performance / Security / i18n / Privacy — tracked as separate programs if ever pursued.

## Questions and Answers

**Q1. Should we auto-generate a full OpenAPI spec from every server action?**
A. No — and the question itself was reframed (DL#215 investigation + 2026-10-11 decision).
`.jay-action` is not a public/private boundary (aiditor ships internal file-read/write actions),
the action protocol is RPC-not-REST, and no per-call auth reaches actions. Exposing agent APIs
(MCP, REST) is therefore **plugin space, not core**; core only provides support hooks. Parked
in #215 until an MCP/REST plugin is built.

**Q2. Is WebMCP a framework gap?**
A. No. `packages/plugins/webmcp` already implements the bridge and tool descriptors. The
only gap is that `jay-framework.dev` doesn't include the plugin. Website-only; no DL needed
beyond this note.

**Q3. Why split instead of one big DL?**
A. CLAUDE.md scope pre-mortem + "a multi-subsystem design is a program — decompose it."
These four generators have different owners, risk, and timelines. This DL is the map; each
child is independently shippable.

**Q4. Where does validation fit?**
A. Every generator gets a paired validation that the artifact exists and is well-formed
(mirrors DL#175's robots check and DL#211's build-output oracle). The validation is the
prevention layer; the generator is the fix.

## Implementation Plan

This DL ships **no code**. It produces three child DLs and one website action item:

1. **DL#213 — structured data (JSON-LD) generation** _(start here, simplest)_
2. **DL#214 — agent-discovery files** (llms.txt, `/.well-known`, ard.json, robots.txt generation)
3. **DL#215 — server-action API documentation** (re-scoped from OpenAPI; curated docs)
4. **Website**: add `@jay-framework/webmcp` to `jay-framework.dev` (no framework change)

Each child follows the full DL methodology (own TL;DR, prior art, verification criteria).

## Verification criteria

- A re-scan of a Jay site built with #213 + #214 shipped shows Discovery recovering the
  JSON-LD and agent-discovery-file checks (0→full), and WebMCP recovering once the website
  adopts the plugin.
- Each generated artifact has a paired validation that fails the build if malformed.

## Trade-offs

- **Generate vs. document**: we're moving schema.org/robots from "documented in agent-kit"
  to "generated by the framework." Cost: more build output + maintenance. Benefit: authors
  can't forget it, and it's correct by construction — the right trade for machine-legibility
  that's invisible to human review (DL#195 boundary-silence lesson).
- **Curated API docs vs. OpenAPI**: curation is manual surface but avoids leaking internal
  actions and produces docs agents can actually use. Revisited in #215.
