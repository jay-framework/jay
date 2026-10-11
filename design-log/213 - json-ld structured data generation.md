# DL#213 — JSON-LD / structured data generation

**Status: [Design]** — child of [DL#212](212%20-%20agent-readability%20of%20generated%20sites.md).
First and simplest of the agent-readability generators. Recovers the Discovery
structured-data checks (schema.org 0/4, 0/2, 0/2, 0/2) from the ora.ai scan.

---

## Decisions for the Implementer (TL;DR)

- **Three ways a page gets JSON-LD** (Part 4): **(A)** site-level auto-emit from `.jay`
  `site.*` (every page, free); **(B)** `jsonLd()` in a `page.ts` slow phase (page-specific,
  computed); **(C)** `<script type="application/ld+json">` written in the jay-html `<head>`
  (the only page-specific option for a **jay-html-only page with no `page.ts`** —
  `route.componentExport` is optional).
- **Five parts, in priority order:**
  1. **Fix a correctness bug** (required): `serializeHeadTags` HTML-escapes `<script>`
     children, which **corrupts JSON-LD**. Any `&`/`<`/`>` in the JSON (e.g. a URL with
     `?a=1&b=2`) becomes `&amp;`/`&lt;` — literal characters inside a script raw-text
     element, breaking `JSON.parse`. This must be fixed before JSON-LD can work at all.
  2. **Auto-emit site-level `Organization` + `WebSite` JSON-LD** from `.jay` `site`
     config at build (path A — highest leverage, every site gets it free).
  3. **Typed helper** `jsonLd(obj): HeadTag` (path B) so authors stop hand-writing the
     `{ tag:'script', attrs:{type:'application/ld+json'}, children: JSON.stringify(...) }`
     boilerplate (the raw pattern is documented in `seo-guide.md:56` today).
  4. **Make `type="application/ld+json"` first-class template data** (path C): collect it in
     `validateAndCollectScripts` **without** the `jay-script="allow"` escape hatch and without
     the inline-script warning — it's data, not executable JS — and emit it breakout-safe.
  5. **Validation** across both tiers (below) + **agent-kit** updates (both role kits).
- **One shared serializer** (DL#195 lesson): the fix lands in
  `stack-server-runtime/lib/head-tags.ts` `serializeHeadTags`, used by **both** dev SSR
  (`stack-server-build`) and production (`production-server`). One fix, both targets.
  Needs a cross-target fixture (boundary-silence lesson, DL#195).
- **Validation** (prevention): a **project-level** warning fires when `site.name` is unset —
  no `Organization`/`WebSite` identity will be generated — independent of any per-page schema
  (beside the existing `site.baseUrl` warning). Tier 1 also validates template `ld+json` JSON
  (source-visible); Tier 2 (DL#211) validates the _validity_ of slow (`B`) and template (`C`)
  JSON-LD from built output. No per-page "missing schema" nudge (page types are optional);
  fast-phase JSON-LD is a documented blind spot.
- **Null hypothesis**: per-page JSON-LD is _already_ expressible via `headTags` from
  `phaseOutput` (B) and via template scripts (C) — so we add **no new phase-output surface**.
  We only fix serialization, add the site-level generator, add a thin helper, and make
  template `ld+json` first-class. Rich per-page types (Product, Article, BreadcrumbList) stay
  author-provided — **not** auto-inferred.

---

## Background

JSON-LD (`<script type="application/ld+json">`) is how search engines and AI agents read
structured facts about a page/site (who publishes it, what it is, its name/logo/links).
schema.org is the vocabulary. The ora scan weights it across four Discovery checks.

Jay's head pipeline (DL#127/#148) already lets a component return `headTags` from
`phaseOutput`, and `seo-guide.md` (agent-kit) already documents emitting JSON-LD that way:

```typescript
// seo-guide.md:56-57 — the documented pattern today
{ tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(structuredData) }
```

## Problem

1. **The documented pattern is subtly broken.** `serializeHeadTags`
   (`head-tags.ts`) does:
   ```typescript
   const children = tag.children ? escapeHtml(tag.children) : '';
   return `    <${t}${attrs}>${children}</${t}>`;
   ```
   `escapeHtml` replaces `&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`. Inside a
   `<script type="application/ld+json">` the content is **raw text**, so those entities are
   never decoded — the emitted JSON literally contains `&amp;`, and `JSON.parse` fails.
   Any JSON-LD with a `&` in a URL, or `<`/`>` anywhere, ships corrupted. ✅ verified bug.
2. **No site-level structured data.** Even with the pattern working, every page/site must
   hand-author Organization/WebSite schema. Nothing generates it from project config, so
   in practice no Jay site has it — matching the scan (0/4).
3. **No validation.** Malformed JSON-LD ships silently; a build with broken structured data
   looks fine to human review (DL#195 boundary-silence).

## Prior Art / Adjacent Mechanisms (verified)

| Mechanism                          | Where                                                                 | Relation                                                             |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `headTags` from `phaseOutput`      | `full-stack-component/lib/jay-stack-types.ts:130` (`HeadTag`)        | ✅ per-page JSON-LD already expressible — no new surface needed      |
| `serializeHeadTags`                | `stack-server-runtime/lib/head-tags.ts`                             | ⚠️ **the bug lives here**; shared by dev + prod                     |
| `.jay` `site.baseUrl`              | `stack-cli/lib/config.ts` (`JayConfig.site`)                        | ✅ config home exists; extend with `name`/`logo`/`description`/`sameAs` |
| Sitemap generation                 | `production-server/lib/builder/generate-sitemap.ts` (`baseUrl` arg) | precedent: build-time emission driven by `site` config              |
| schema.org in docs                 | `developer/seo-guide.md:56`, `plugin/seo-guide.md`                  | documented, never generated — this DL promotes it to generated      |
| DL#149 passthrough script raw-emit | `serializeScripts` in same file                                     | precedent: scripts whose bodies are emitted **un-escaped** on purpose |
| slow `headTags` persistence        | `slowly-changing-runner.ts:156` (`carryForward.__slowHeadTags`)     | ✅ where per-page JSON-LD lands in the build → Tier-2-visible          |
| Tier 2 build-output validation     | `stack-cli/lib/check-build-output.ts` (reads `*.cache.json`; DL#211) | ✅ home for presence/validity checks; currently reads `slowViewState` only |

**Load-bearing claims:**
- ✅ verified — `serializeHeadTags` escapes script children (`head-tags.ts`, quoted above).
- ✅ verified — `HeadTag = { tag; attrs?; children? }`; no dedup key for `script`
  (`tagIdentityKey` returns `undefined` for script) — multiple JSON-LD blocks are allowed.
- ✅ verified — `.jay` config exposes `site.baseUrl` only; no `name`/`logo` yet.
- ✅ verified — `serializeScripts` (same file, DL#149) already emits script bodies un-escaped,
  so raw script-body emission is an established, reviewed pattern here.
- ✅ verified — `route.componentExport` is optional (guarded with `if (route.componentExport)`
  in `build-pipeline.ts`/`instance-pipeline.ts`/`load-production-parts.ts`), so a page can be
  **jay-html-only** with no `page.ts` → path B is unavailable for such pages.
- ✅ verified — `validateAndCollectScripts` (`jay-html-parser.ts`) warns on any inline
  `<script>` unless `jay-script="allow"`, has **no** special case for `application/ld+json`,
  and collects allowed scripts into `route.scripts` (not `headTags`) — so template JSON-LD is
  invisible to the slow-headTags path today. This is what Part 4 changes.

## Questions and Answers

**Q1. Why not just stop escaping all script children?**
A. Raw emission needs an XSS-safe serialization for JSON-LD: escape `<`→`\u003c`,
`>`→`\u003e`, `&`→`\u0026` _inside the JSON string_ (the standard safe-JSON-LD technique) so
a `</script>` in data can't break out, while keeping the JSON valid. Scope the special-case
to `tag==='script' && attrs.type==='application/ld+json'`; other scripts already go through
`serializeScripts` (DL#149), not `serializeHeadTags`.

**Q2. Should the helper type against schema.org (schema-dts)?**
A. No — too heavy a dependency for the win. `jsonLd(obj: object): HeadTag` that does the
`JSON.stringify` + correct attrs. Authors can layer their own types. **Decided: thin helper.**

**Q3. Where does the site-level generator run?**
A. At build, alongside sitemap (`baseUrl` already flows there). Reads `.jay` `site` config,
emits one `Organization` + one `WebSite` JSON-LD into every page's `<head>` (or a shared
head fragment). Skipped entirely if `site.name` is absent (→ validation nudge).

**Q4. Auto-infer per-page types (Article for markdown, Product, Breadcrumb)?**
A. **Deferred.** Markdown frontmatter → `Article` is a tempting follow-up but belongs in its
own increment (own DL) to avoid under-specifying the mapping. #213 ships site-level + helper.

**Q5. Must JSON-LD be unique per page?**
A. **No.** schema.org/Google expect the _same_ `Organization`/`WebSite` identity on every
page — enforcing uniqueness would false-positive on the intended site-level schema. Page-
specific types (Article/Product) _should_ differ, but that's optional content, not a rule.
Only a **report-only** duplicate-identical-block-on-one-page de-dup check is worthwhile. See
Part 5.

**Q6. Can Tier 1 (`validate`) check per-page JSON-LD directly?**
A. **Partly.** Template-authored JSON-LD (path C, Part 4) is in source, so Tier 1 validates
its JSON there. But slow-phase `jsonLd()` output (path B) exists only in the build
(`carryForward.__slowHeadTags`), so its presence/validity are **Tier 2** checks. This is why
"static page" and "dynamic page" are the _same_ check in Tier 2 — both are built instances.

**Q7. How does a jay-html-only page (no `page.ts`) add JSON-LD?**
A. Path C — write `<script type="application/ld+json">{…}</script>` in `<head>`. Part 4 makes
`ld+json` first-class template data (no `jay-script="allow"` escape hatch), and site-level
schema (path A) covers it automatically when `site.*` is configured.

## Design

### Part 1 — Fix serialization (required)

In `serializeHeadTags`, special-case JSON-LD scripts:

```typescript
function escapeJsonLd(json: string): string {
    // Keep valid JSON; prevent </script> breakout. Standard safe-JSON-LD escaping.
    return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
// in serializeHeadTags, before the generic children path:
if (t === 'script' && tag.attrs?.type === 'application/ld+json') {
    return `    <script type="application/ld+json">${escapeJsonLd(tag.children ?? '')}</script>`;
}
```

### Part 2 — Site-level Organization + WebSite

Extend `JayConfig.site`:

```typescript
site?: {
    baseUrl?: string;
    name?: string;
    logo?: string;          // absolute or baseUrl-relative
    description?: string;
    sameAs?: string[];      // social/profile URLs
};
```

Build-time generator (next to sitemap) emits, when `site.name` is present:

```text
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"...","url":"<baseUrl>","logo":"...","sameAs":["..."]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"...","url":"<baseUrl>"}</script>
```

injected into every page head via the existing head pipeline.

### Part 3 — `jsonLd` helper

```typescript
export function jsonLd(data: object): HeadTag {
    return { tag: 'script', attrs: { type: 'application/ld+json' }, children: JSON.stringify(data) };
}
```

Exported from the component package so `page.ts` returns `headTags: [jsonLd(product)]`.

### Part 4 — Template-authored JSON-LD (static pages, no `page.ts`)

A page can be **jay-html-only** — `route.componentExport` is optional (guarded everywhere
with `if (route.componentExport)`), so there may be no `page.ts` slow phase to return
`headTags`. Such a page has three ways to carry JSON-LD:

| Path | Mechanism | Needs `page.ts`? | Serializer |
| --- | --- | --- | --- |
| **A. Site-level (auto)** | `.jay` `site.*` → Organization+WebSite on every page (Part 2) | no | `serializeHeadTags` |
| **B. `page.ts` slow phase** | `headTags: [jsonLd(data)]` → persisted as `__slowHeadTags` | **yes** | `serializeHeadTags` |
| **C. In the jay-html `<head>`** | `<script type="application/ld+json">{…}</script>` | no | `serializeScripts` (DL#149) |

Path C is the only page-specific option for a jay-html-only page, but today it's awkward:
`validateAndCollectScripts` (`jay-html-parser.ts`) treats _any_ inline script as "not
supported" unless the author adds the `jay-script="allow"` escape hatch — a mechanism meant
for 3rd-party JS (analytics/tag managers), not for structured **data**. And a collected
template script lands in `route.scripts` (`JayHtmlScript[]`), **not** in
`headTags`/`__slowHeadTags`, so the Part 5 Tier-2 checks would miss it.

**Decision: `type="application/ld+json"` is first-class template data, not a "script".**

- In `validateAndCollectScripts`, special-case `type="application/ld+json"`: collect it
  **without** requiring `jay-script="allow"` and **without** the inline-script warning (it's
  XSS-safe under JSON-LD escaping; it executes nothing).
- Emit it with the **same breakout-safe JSON-LD escaping** as Part 1 (replace `<`, `>`, `&`
  with their JSON `\uXXXX` unicode escapes) so all paths are byte-identical and safe, whether
  it flows via `serializeScripts` or a shared helper.
- Make the Part 5 Tier-2 checks scan `route.scripts` for `application/ld+json` too, so all
  three paths get identical presence + validity validation.

Net: a static jay-html-only page adds structured data by just writing
`<script type="application/ld+json">{…}</script>` in `<head>` — no escape hatch, no `page.ts`.

### Part 5 — Validation (two tiers)

JSON-LD comes from three sources (Part 4) with different visibility:
- **Path C (template `<script type="application/ld+json">`)** is in **source** → checkable in
  **Tier 1**.
- **Path B (slow-phase `headTags`)** is **not in source** — only in the build as
  `carryForward.__slowHeadTags` (`slowly-changing-runner.ts:156`, read back at
  `fetch-page-handler.ts:119`) → checkable only in **Tier 2**.
- **Path A (site-level)** is config-driven → its presence is known from `.jay` in Tier 1.

**Site identity (`Organization`/`WebSite`) — yes, we warn, and it's _separate_ from per-page
schema.** Site identity is **site-wide**, driven solely by `.jay` `site.name` (path A). It must
be warned on **independently** — a page carrying its own `Article`/`Product` block does **not**
mean the site has an `Organization`/`WebSite` identity. So this is a **project-level** warning
(once per build), sitting beside the existing `site.baseUrl`→sitemap warning
(`validate.ts:2289`, DL#175), **not** gated on any page's JSON-LD:

> `site.name` not configured — no `Organization`/`WebSite` structured data will be generated.
> Add to `.jay`: `site:\n  name: …\n  baseUrl: …`

**Tier 1 — `validate` (source-only, always-on):**
- **warning (project-level)**: missing site identity, as above (`!config.site?.name`).
- **error (per-page)**: any template `application/ld+json` block (path C) whose body is not
  valid JSON parsing to an object with `@context` + `@type`. Source-visible, caught pre-build.
- We do **not** warn per-page on "this page has no page-specific schema" — page content types
  (Article/Product) are optional (Q4), so such a nudge would be noise. The only presence
  signal is the project-level site-identity warning above.

**Tier 2 — `validate --tier-2` (build-output, DL#211):** at build, static and dynamic pages
collapse to concrete instances, so **one check covers both** (answers Q-static + Q-dynamic
above). Extend `check-build-output.ts` to read **both** `cache.carryForward.__slowHeadTags`
(path B — same cache file it already opens via `loadSlowViewState`; today it reads only
`slowViewState`) **and** `route.scripts` (path C) for `application/ld+json` entries:
- **validity (error, per instance)**: every emitted `application/ld+json` body is valid JSON
  parsing to an object with `@context` + `@type`. This catches malformed `jsonLd()` payloads
  (path B) **in the actual built output** — the only place the resolved slow JSON exists.
- **no per-instance presence warning**: with site identity on, every page already has
  `Organization`/`WebSite`, so a presence check always passes; with it off, the project-level
  `site.name` warning already fires once. A per-instance presence warning would be pure
  redundancy/noise, so Tier 2 only validates _validity_, not presence.
- **caveat (documented, not enforced)**: **fast-phase** `headTags` are computed per request
  and not persisted, so Tier 2 cannot see JSON-LD emitted only in the fast phase. Structured
  data is build-time by nature, so this is an accepted blind spot, noted in the guide.

**Uniqueness (Q5): not enforced.** The site-level `Organization`/`WebSite` is _intentionally
identical_ on every page (that's correct site identity — flagging it would be a false
positive). The only uniqueness signal worth having is **report-only**: duplicate _identical_
blocks within a single page (a de-dup nicety). We do **not** require distinct JSON-LD per page.

## Implementation Plan

1. **Serialization fix + fixtures** (`head-tags.ts`): JSON-LD special case; unit tests in
   `head-tags.test.ts` (JSON with `&`/`<`/`>` round-trips to valid, breakout-safe output);
   cross-target fixture proving dev SSR and production emit identically (DL#195).
2. **`jsonLd` helper** + export + unit test.
3. **`site` config extension** + build-time Organization/WebSite generator + fixture page
   asserting both blocks appear in the built head.
4. **Template-authored `ld+json` first-class** (`jay-html-parser.ts`): special-case
   `type="application/ld+json"` in `validateAndCollectScripts` — collect without
   `jay-script="allow"`, no inline warning; emit with the Part-1 JSON-LD escaping; fixture
   proving a plain `<script type="application/ld+json">` in a jay-html `<head>` survives to
   the built output un-escaped and breakout-safe.
5. **Validation**:
   - Tier 1 **project-level** warning on `!config.site?.name` — missing `Organization`/
     `WebSite` identity — added beside the existing `site.baseUrl` warning (`validate.ts:2289`).
   - Tier 1 **per-page** error: template `ld+json` body not valid JSON with `@context`+`@type`.
   - Tier 2: extend `check-build-output.ts` to read `cache.carryForward.__slowHeadTags` **and**
     `route.scripts` alongside `slowViewState`; JSON-validity (error) over every
     `application/ld+json` entry per instance (no presence warning — see Part 5); fixture with a
     built instance whose cache carries a valid and a malformed JSON-LD block.
6. **Agent-kit** (see below): update `seo-guide.md` + validation guide.

## Agent-kit updates

Agents author both pages (designer) and page logic (developer), so JSON-LD guidance must land
in both role kits — with a clear decision tree for the three paths:

- **`designer/seo-guide.md`** — add the **template path (C)**: write
  `<script type="application/ld+json">{…}</script>` directly in `<head>` for static,
  page-specific structured data. Emphasize it needs **no** `jay-script="allow"` (contrast with
  DL#149 scripts), and that site-wide identity (Organization/WebSite) is automatic from `.jay`
  `site.*` — don't hand-write it per page.
- **`developer/seo-guide.md`** — replace the hand-rolled
  `{ tag:'script', attrs:{type:'application/ld+json'}, children: JSON.stringify(...) }` snippet
  (currently `seo-guide.md:56`) with the **`jsonLd(data)` helper** (path B); document the
  slow-vs-fast phase rule (prefer slow so it's persisted/validated; fast JSON-LD is a Tier-2
  blind spot).
- **Decision tree** (both guides): site identity → `.jay` `site.*` (A); per-page on a
  static/jay-html-only page → template `ld+json` (C); per-page computed from data/props →
  `jsonLd()` in the slow phase (B).
- **`.jay` `site.*` reference** — document the new `name`/`logo`/`description`/`sameAs` keys in
  the developer config/setup guide so the automatic Organization/WebSite schema is populated.
- **Validation guide** — note the project-level missing-`site.name` identity warning, the
  Tier-1 template-`ld+json` JSON check, and the Tier-2 validity check (+ the fast-phase blind
  spot), so agents know what `validate` / `validate --tier-2` will flag.
- **Example** — add one minimal static page with template JSON-LD to the agent-kit examples so
  agents have a copy-paste pattern (boundary/live-example lesson, DL#195).

## Verification criteria

- A built page whose `page.ts` returns `jsonLd({...with a URL containing &...})` ships JSON
  that `JSON.parse` accepts and that contains no `&amp;`/`&lt;`.
- A **jay-html-only** page with `<script type="application/ld+json">{…}</script>` in `<head>`
  (no `page.ts`, no `jay-script="allow"`) builds without warnings and ships that block valid
  and breakout-safe.
- A project with `site.name` set ships Organization + WebSite JSON-LD on every page.
- A re-scan recovers the Discovery schema.org checks.
- `validate` (Tier 1) fails a page with malformed template JSON-LD; `validate --tier-2` fails
  a built instance with malformed slow (`jsonLd()`) JSON-LD.

## Trade-offs

- **Special-casing script serialization** adds a branch to the hot serializer, but it's the
  only correct way to emit JSON-LD through the existing pipeline (the alternative — a
  separate JSON-LD channel — is more surface for no gain).
- **Config-driven site schema** means the data lives in `.jay`, not in code. That's the
  right home (same as `baseUrl`), and it's what makes the win automatic rather than
  per-author.

## Scope — what #213 does NOT do

- Per-page rich types (Article/Product/BreadcrumbList) auto-inference → **own DL** if wanted.
- schema-dts typing of the helper → deliberately out (Q2).
- OpenAPI / action docs → DL#215. Agent-discovery files → DL#214.
