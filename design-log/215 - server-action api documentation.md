# DL#215 — Server-action API documentation (OpenAPI / curated docs)

**Status: [Parked]** — child of [DL#212](212%20-%20agent-readability%20of%20generated%20sites.md).
Began as the OpenAPI item for the ora.ai Access checks (0/7); investigation reframed it, then a
2026-10-11 architecture decision **parked** it (no work until the plugins are built).

> ✅ **2026-10-11 DECISION (supersedes everything below).** Exposing agent-facing API surfaces
> (**MCP, REST**) is the **space of plugins, not the core framework**. The core framework's only
> job is to **support** such plugins (see _Core-side support_ below). Target architecture:
>
> **core framework support + MCP plugin + REST plugin**
>
> We are **not building the MCP/REST plugins now**, so this discussion is **parked**. No core
> code lands from this DL yet either — the core-support items are noted so that whoever builds
> the first exposure plugin knows what hooks to add. ora's _OpenAPI 0/7_ is accepted as
> deferred until a REST plugin exists; the agent-callable gap is otherwise addressed by the
> `webmcp` plugin (already shipped) + `.well-known/ard.json` discovery (DL#214).
>
> ⚠️ The 2026-10-09 investigation (below) still stands as the _rationale_ — actions are not a
> clean base for a blanket OpenAPI (not a public/private boundary; RPC-not-REST envelope; no
> per-call auth). It is **why** exposure belongs in plugins, not core. See
> **[Investigation Results](#investigation-results-2026-10-09)**. Everything between here and
> there is the original (pre-investigation) draft, kept for history.

---

## Core-side support (the only part that is ever core's job)

These are the hooks an MCP or REST plugin needs from core to project Jay's capabilities. **None
are built in this DL** — listed so the first exposure plugin's author (or a follow-up DL) has
the map:

- **Server-route registration for plugins** — a plugin must be able to mount its own HTTP
  handler (e.g. `/mcp`, `/api/*`, `/openapi.json`). Verify/extend the plugin route mechanism.
- **Action metadata access** — read the exposed set + schemas: `ActionMetadata { name,
description, inputSchema, outputSchema }` (`stack-server-build/lib/action-metadata.ts`) and
  the runtime `getActionsWithMetadata()` (`stack-server-runtime/lib/action-registry.ts`).
  Method is derivable (`makeJayAction`→POST, `makeJayQuery`→GET). ✅ exists today.
- **Per-call auth/context into actions** — the current gap: `execute(name, input)` →
  `handler(input, ...services)` forwards **no** request/cookies/headers (✅ verified). Any
  authenticated or mutating exposure needs core to thread per-call context to actions. Likely
  its **own DL** before a REST/MCP plugin can expose non-public actions.
- **An exposure opt-in marker** — `.jay-action` has no `public`/`scope` field (✅ verified), and
  `.jay-action` is _not_ a public/private boundary (aiditor ships internal `readFile`/
  `writePluginSource` actions). A plugin needs a reliable signal for which actions are safe to
  expose; core should own that marker so every exposure plugin reads the same boundary.

## Decisions for the Implementer (TL;DR)

- **The hard parts already exist — this is mostly a renderer.** The framework already:
  - parses each `.jay-action` into `ActionMetadata { name, description, inputSchema,
outputSchema }` where **input/output are already JSON Schema**
    (`stack-server-build/lib/action-metadata.ts` → `jayTypeToJsonSchema`), explicitly "for
    consumers (AI agent tool builders)";
  - exposes each action at a **known endpoint** `/_jay/actions/<actionName>`
    (`production-server/lib/serve/fetch-action-handler.ts:9`);
  - **already curates**: "Actions without `.jay-action` files are not exposed to AI agents."
- **❌ FALSIFIED (see Investigation Results):** this bullet claimed "the `.jay-action` opt-in IS
  the curation boundary." It is not. There is no public/private field on `.jay-action`, and the
  `aiditor` plugin ships `.jay-action` files for internal editor RPC (`readFileAction`,
  `writePluginSourceAction`, …). A blanket spec **would** leak internal tooling.
- **Settled**: generate API documentation **from `ActionMetadata`** at build, for exactly the
  `.jay-action`-declared actions. JSON Schema → OpenAPI schemas is near-mechanical.
- **OPEN (Q1) — the one thing to decide**: output format. OpenAPI JSON (what ora scores and
  tools consume) vs. curated markdown (top-level + per-category) vs. **both from one source**.
  Recommendation: **both** — same `ActionMetadata`, two thin renderers. OpenAPI for the score
  - machine consumption; markdown for humans/agents browsing. Decide before building.
- **Needs confirmation (⚠️)**: the HTTP **method** per action. `ActionMetadata` (from
  `.jay-action`) has no `method` field; the handler reads `action.method` at runtime
  (`fetch-action-handler.ts:45`). Find where method is declared/registered and thread it into
  the generator, or default by convention. Resolve during implementation.
- **Validation**: fail the build if an action's `.jay-action` schema can't render (e.g. an
  input type with no JSON-Schema mapping), so the public API doc can't silently go stale/wrong.

---

## Background

ora's headline for `jay-framework.dev`: _"full payment processing, but lacks an OpenAPI
specification."_ OpenAPI is how agents learn a site's callable API — endpoints, input/output
schemas, descriptions. Jay's server actions are exactly such an API, and their metadata is
already structured and JSON-Schema-typed.

## Problem

Nothing in the framework emits an OpenAPI spec or any browsable API doc from actions
(verified: no `openapi`/`swagger` in the codebase, DL#212). The `.jay-action` metadata —
name, description, JSON-Schema input/output — is computed and handed to the runtime registry
but never projected into a published, agent-consumable API description. So the Access/OpenAPI
checks score 0/7 despite the data existing.

## Prior Art / Adjacent Mechanisms (verified)

| Mechanism                        | Where                                                                        | Relation                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `.jay-action` → `ActionMetadata` | `stack-server-build/lib/action-metadata.ts` (`parseActionMetadata`)          | ✅ supplies name/description/input+output **JSON Schema**       |
| JayType → JSON Schema            | `compiler-shared/lib/jay-type-to-json-schema.ts` (`jayTypeToJsonSchema`)     | ✅ the hard conversion is done; OpenAPI schemas ⊃ JSON Schema   |
| Action endpoint convention       | `production-server/lib/serve/fetch-action-handler.ts:9` (`/_jay/actions/`)   | ✅ the OpenAPI `path` per action                                |
| Curation boundary                | action-metadata.ts header: "no `.jay-action` ⇒ not exposed to AI agents"     | ✅ resolves "expose all?" — only declared actions are public    |
| Action registry w/ metadata      | `stack-server-runtime/lib/action-registry.ts` (`getActionsWithMetadata()`)   | runtime source of the exposed set; mirrors the build view       |
| Action HTTP method               | `fetch-action-handler.ts:45` reads `action.method`                           | ⚠️ not in `ActionMetadata` — confirm its declared source        |
| Manifest `ActionEntry`           | `production-server/lib/types.ts` (`actionNames`, `serverModule`, `isPlugin`) | slim; richer per-action docs come from re-reading `.jay-action` |

**Load-bearing claims:**

- ✅ verified — `ActionMetadata` carries `inputSchema` (JSON-Schema object) and `outputSchema`
  (JSON Schema); produced via `jayTypeToJsonSchema`.
- ✅ verified — actions are served at `/_jay/actions/<name>`.
- ✅ verified — only `.jay-action`-backed actions are exposed (curation already exists).
- ⚠️ assumed — per-action HTTP method lives outside `ActionMetadata`; source to confirm.

## Questions and Answers

**Q1 (OPEN — user-flagged). OpenAPI spec, curated per-category docs, or both?**
A. Three framings, same source data:

- **OpenAPI JSON** (`/openapi.json`): directly what ora scores; consumable by agent
  tooling, Swagger UI, codegen. Cheap — a renderer over `ActionMetadata` + endpoint + method.
- **Curated markdown** (one top-level `api.md` + one doc per action category/plugin): more
  human/agent-browsable, groups by plugin/namespace (`cart.add`, `cart.remove` → "cart").
- **Both** (recommended): render OpenAPI _and_ markdown from the same `ActionMetadata`
  pass. The user's concern about over-exposure is already handled by the `.jay-action`
  boundary, so there's no curation cost to generating the full (already-curated) spec.
  **Decision needed before implementation.** Default to both unless told otherwise.

**Q2. Per-category grouping — by what key?**
A. Action names are namespaced (`cart.add`). Group by the segment before the first `.`
(or by owning plugin). Yields natural per-category docs and OpenAPI tags.

**Q3. Where does it emit / where is it served?**
A. Beside sitemap/llms.txt (DL#214) in the production output dir, served at a stable path
(`/openapi.json`, `/api.md`). Same build-time emission step.

**Q4. Plugin actions vs page actions — both documented?**
A. Any action with a `.jay-action` is documented regardless of origin (`isPlugin` just
becomes a tag/section). Non-`.jay-action` actions stay private.

## Design (pending Q1)

One build-time pass collects `ActionMetadata` for every `.jay-action` (reuse
`loadActionMetadata`), attaches endpoint (`/_jay/actions/<name>`) and method, then renders:

- **OpenAPI** `3.1` doc: one `path` per action; `requestBody`/`parameters` from `inputSchema`;
  `responses.200` from `outputSchema`; `summary`/`description` from metadata; `tags` from Q2.
  (OpenAPI 3.1 uses JSON Schema directly — minimal transform.)
- **Markdown** (if chosen): `api.md` index linking per-category docs; each lists actions with
  description, method+path, input/output tables from the schemas.

## Implementation Plan

1. **Resolve Q1** (format) and **Q-method** (⚠️ method source).
2. **Collector**: enumerate `.jay-action` files (reuse plugin/action discovery), load
   `ActionMetadata`, attach endpoint + method; fixture over a multi-action, multi-category set.
3. **OpenAPI renderer** (`JsonSchemaProperty` → OpenAPI schema); fixture asserting a valid
   spec that `JSON.parse` + an OpenAPI validator accepts.
4. **Markdown renderer** (if Q1 = markdown/both) grouped per Q2.
5. **Emit** beside sitemap/llms.txt; wire into both sitemap call sites.
6. **Validation**: error when an exposed action's schema can't render (keeps the public doc
   honest); report when a project has actions but no `.jay-action` (none exposed to agents).
7. **Agent-kit**: document that `.jay-action` is what publishes an action to agents, and that
   OpenAPI/API docs are generated from it.

## Verification criteria

- A project with `.jay-action`-declared actions builds an `/openapi.json` that validates and
  contains one operation per declared action with correct input/output schemas and paths.
- Actions **without** `.jay-action` do not appear in any generated doc.
- A re-scan recovers the Access/OpenAPI checks.

## Trade-offs

- **Generated spec vs hand-curated**: generation stays in sync with the real schemas (which
  are already derived from types), eliminating drift — the main failure mode of hand-written
  OpenAPI. Cost: a method field to thread and a renderer to maintain.
- **Both formats**: small extra renderer for markdown; justified because OpenAPI serves
  machines and markdown serves humans/browsing agents, from one source with no divergence risk.

## Scope — what #215 does NOT do

- Auth/security scheme modeling in the spec beyond what metadata provides → follow-up if needed.
- Live Swagger UI hosting → out (emit the static spec; UI is a website choice).
- Non-action HTTP surface (pages) → covered by sitemap/llms.txt (DL#214), not here.

---

## Investigation Results (2026-10-09)

Prompted by the user: _"explore the examples repo and the plugins there to check what actions
are recorded and if it makes sense to expose those … there are still questions on the action
payload format, and about action authentication or other call requirements, such as cookies.
I am not sure actions are the right base for an open API."_ The audit confirms the doubt.

### What the example apps actually declare (verified)

Surveyed every `.jay-action` under `~/work/jay/{wix,golf,…}` (non-node_modules). Three natures:

| Nature                                             | Examples                                                                                                                                                                                                        | Expose publicly?                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Read-only catalog **queries** (`makeJayQuery`/GET) | `wix-stores` searchProducts/getProductBySlug/getCollections/getCategories/getVariantStock; `wix-bookings` listServices/listSlots; `wix-data` queryItems/getItemBySlug/getCategories; `wix-forms` getFormSummary | ✅ the only clean fit                                    |
| **Mutations** (`makeJayAction`/POST)               | `wix-bookings` createBooking; `wix-forms` submitForm                                                                                                                                                            | ⚠️ need auth/validation — unsafe to document as callable |
| **Internal editor RPC**                            | `aiditor` (~35): `readFileAction` ("read a file from the project filesystem"), `writePluginSourceAction`, run-publish, submit-task, cancel-agent-task                                                           | ❌ must never be public                                  |
| Stateful agent protocol (streaming)                | `gemini-agent` sendMessage, submitToolResults (ndjson)                                                                                                                                                          | ❌ not a REST resource                                   |

### Three verified blockers to "actions → OpenAPI"

1. **`.jay-action` is not a public/private boundary.** Parsed keys are only `name`,
   `description`, `inputSchema`, `outputSchema`, `import` (`action-metadata.ts`) — **no
   `public`/`scope`/`auth` field**. `aiditor`'s `readFileAction`/`writePluginSourceAction`
   prove `.jay-action` is used for internal tooling. ✅ verified.
2. **Custom RPC envelope, not REST** (`fetch-action-handler.ts`): responses are wrapped
   `{ success, data }` / `{ success, error:{code,message,isActionError} }` (so `outputSchema` ≠
   body); GET input is `?_input=<JSON>` (opaque) or flat params; streaming actions emit
   `application/x-ndjson`. `ActionMetadata` schemas don't map 1:1 to OpenAPI bodies. ✅ verified.
3. **No per-call auth model.** `execute(name, input)` → `resolveServices()` →
   `handler(input, ...services)` — the request, **cookies, and headers are never forwarded to an
   action**; credentials come from server-side service injection (env/config), not the caller.
   `parseCookies` (`stack-server-runtime/lib/cookies.ts`) is used only by the page-SSR path.
   So a documented public mutation (`createBooking`) is caller-unauthenticated at the protocol
   level — there is no security scheme to describe. ✅ verified.

Also resolved: the earlier ⚠️ "method source" question — `makeJayAction` defaults **POST**,
`makeJayQuery` defaults **GET** (`jay-action-builder.ts:284/305`); the method is on the runtime
action object, derivable per action.

### Decision this forces (supersedes Q1)

A blanket OpenAPI from all `.jay-action`s is rejected. Live options (pick one — see the
question put to the user):

- **A — Explicit public opt-in, GET-queries only.** Add a `public: true` field to `.jay-action`
  (new, author-set); generate OpenAPI **only** for opted-in `makeJayQuery` (GET) actions;
  model the `{ success, data }` envelope. Read-only, safe, honest; the smallest spec that
  scores the Access/OpenAPI checks. Mutations/streaming/internal stay out by construction.
- **B — Pivot to the MCP/agent-card route, skip OpenAPI.** Serve the agent-callable surface as
  MCP server cards (`application/mcp-server-card+json`) referenced from `.well-known/ard.json`
  (DL#214 Q7) and/or WebMCP tool descriptors. This is arguably what agent-usability wants more
  than OpenAPI, reuses #214 infra, and sidesteps the envelope/auth mismatch. Cost: does not
  directly recover ora's _OpenAPI_ checks (it recovers usability/discovery instead).
- **C — Reserve OpenAPI for a hand-authored REST surface.** Drop auto-from-actions; only emit
  an OpenAPI if/when the project defines deliberate REST endpoints. Lowest framework surface;
  defers the score.

**Resolved (2026-10-11):** none of A/B/C land in core. The surface audit (MCP, WebMCP, REST,
schema.org actions — see the surface map in the DL thread) concluded that **exposing** any of
these is **plugin work**; core only provides the hooks in _Core-side support_ at the top. So:

- **MCP / REST** → future plugins (not built; parked).
- **WebMCP** → already a plugin (`packages/plugins/webmcp`).
- **Discovery** (what points at these surfaces) → `.well-known/ard.json` + `llms.txt` (DL#214),
  JSON-LD (DL#213).
  This DL is **parked** until the first exposure plugin is built; the Design/Implementation
  sections above are not pursued.
