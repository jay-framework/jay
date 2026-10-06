# DL#210 — Broken Internal Link Validation

**Status: [Design]** — for review. Do not implement until approved.

## Decisions for the Implementer (TL;DR)

- **Two checks, split by what is decidable at `validate` time — not by href shape.**
  - **Check 1 (validate-time, this DL):** resolve **every** internal `href` against the set of things we can
    know statically — **concrete static routes + public assets**. Anything that resolves to nothing is a
    **validate error**: degenerate (`#`, empty), typo'd path, or a link to a static page that does not exist.
    The **only** thing Check 1 defers is an href that **matches a dynamic route pattern** (`/blog/[slug]`),
    because we cannot enumerate the slug list without running `loadParams`.
  - **Check 2 (deferred to its own DL):** the residue — hrefs that match a _dynamic_ route pattern, where we
    need the enumerated param values to know if the specific URL exists. **Deferred.** When built, it targets
    **approach (b): an agent-kit-generated slug/param reference** that `validate` consumes (keeps the check at
    validate time). Approach (a) (build-time output-HTML check) is **rejected** — too late in the cycle and
    still exposed to post-build route mutation by Jay's slow-render/second server.
- **Check 1 is a core project-level `validate` pass, not a per-file plugin.** It needs the route set, and the
  DL#145 plugin context is per-file and route-blind (`plugin-validators.ts:25-52`). ✅ verified. Model it on
  the existing NO-DESIGN-SYSTEM project pass (`validate.ts:1461-1489`): `validate` already has `scanDir`,
  `projectRoot`, `loadConfig`, and already reads `public/` (`validate.ts:2257`). ✅ verified.
- **Route patterns are cheap at validate time.** `scanRoutes(scanDir, …)` yields patterns + param names only
  (no `loadParams`, no network) — `route-scanner.ts:322`. ✅ verified. A route is **static** iff all its
  segments are strings; dynamic iff any segment is an object — `route-scanner.ts:115`
  (`route.segments.some(s => typeof s !== 'string')`). ✅ verified. So Check 1 builds concrete URLs from
  static routes and classifies dynamic routes as "defer to Check 2."
- **Severity:** broken internal link (incl. degenerate `#`/empty and missing static page) → **error**. There
  is no legitimate reason to link to a URL that cannot resolve. (A JS-driven `<a href="#">` should be a
  `<button>`; keep an escape hatch via the standard `application/jay-validations` suppression.)
- **Scope:** internal links only (root-relative `/…`, relative `…`, same-origin absolute via `site.baseUrl`).
  Out of scope: external-link liveness, `#fragment` target existence, `mailto:`/`tel:`/`javascript:`. See
  Scope Pre-Mortem.

---

## Background

Reported on the live **jay-website** site (sibling repo `/Users/yoav/work/jay/jay-website`): internal links
that 404. The project's prevention-first methodology (CLAUDE.md: validation first) says the framework should
catch this at validate/build time, not in production.

Two concrete instances were found:

1. **Footer placeholders** — `src/components/site-footer/site-footer.jay-html:73-74`:

   ```html
   <a href="#">Security Policy</a> <a href="#">Privacy</a>
   ```

   `#` placeholders that ship as dead links; no backing page was ever created. Duplicated across nearly every
   page's footer.

2. **Hardcoded link to an ungenerated slug** — `src/pages/design-log/page.jay-html:704`:
   ```html
   <a class="dl-hero-link" href="/design-log/wix/index">…</a>
   ```
   The route **pattern** `/design-log/wix/[slug]` exists (markdown plugin, `contentDir: content/design-log/wix`),
   but `content/design-log/wix/` has **no `index.md`**, so slug `index` is never generated → 404. (Sibling
   `jay/` and `website/` sections _do_ have `index.md`, which is why the author assumed `wix` would too.)

Instance 1 (and any link to a missing **static** page) is Check 1. Instance 2 is Check 2 (deferred) — the href
matches the dynamic pattern `wix/[slug]`, so distinguishing "slug `index` exists" from "never generated" needs
the enumerated slug list.

## Problem

A link is "broken" in ways that differ by **what we can know at validate time**:

| href                                             | Resolves against…     | Decidable at validate?  | Owned by               |
| ------------------------------------------------ | --------------------- | ----------------------- | ---------------------- |
| `#`, `""`                                        | nothing               | yes                     | Check 1 — **error**    |
| `/pirvacy` (typo, no route)                      | no route pattern      | yes                     | Check 1 — **error**    |
| `/about` where `/about` is a static page         | a static route        | yes                     | Check 1 — ok           |
| `/about` where no such static page exists        | no route              | yes                     | Check 1 — **error**    |
| `/images/logo.svg`                               | public asset          | yes                     | Check 1 — ok           |
| `/blog/first-post` where route is `/blog/[slug]` | a **dynamic** pattern | **no** (need slug list) | Check 2 — **deferred** |

The subtlety that forces the split: a link matching a dynamic pattern (`/design-log/wix/index` vs
`wix/[slug]`) is _syntactically_ valid but may be a 404 depending on the enumerated slugs — and those are
produced only by `loadParams`, which we deliberately do not run during `validate` (build-only, possibly
network-bound). So Check 1 can only say "this matches a dynamic pattern — I can't confirm the instance";
Check 2 is the mechanism that supplies the instance list.

## Prior Art / Adjacent Mechanisms

- **DL#145 pluggable jay-html validation** — per-file validators; context is route-blind, no line/column
  (`plugin-validators.ts:25-52`). ✅ verified. → **Not** the home for Check 1 (needs the route set).
- **NO-DESIGN-SYSTEM project pass** (`validate.ts:1461-1489`) — precedent for a core project-level `validate`
  finding after the per-file loop. → The template for Check 1.
- **`scanRoutes(scanDir, options): Promise<JayRoutes>`** (`route-scanner.ts:322`) — patterns + param names,
  no instances, no `loadParams`. Static-vs-dynamic distinguishable via segment type
  (`route-scanner.ts:115`). ✅ verified. → Supplies Check 1's static route set and flags dynamic ones.
- **`route-to-express-route.ts`** — converts a route to an Express/path-to-regexp pattern. → Reusable for
  matching an href against dynamic patterns (to decide "defer to Check 2").
- **`checkRouteParams(parsedFile, jayFile, scanDir)`** (`validate.ts:2000`) — `validate` is **already**
  route-aware for param checks. → Confirms calling route scanning from `validate` is established, not new.
- **DL#175 sitemap generation** — `generate-sitemap.ts` builds the canonical URL set from `RouteManifest`
  (`routes × instances`) at build time. ✅ verified. → This is what approach (a) for Check 2 would reuse; it
  is **rejected** here (too late; post-build mutation). Noted so a future Check-2 DL does not re-litigate it.
- **DL#204 design-system index in agent-kit** — establishes agent-kit as the home for _generated reference
  data_ consumed by validation. → The natural home for Check 2's slug/param reference (approach b).

**Null-hypothesis result:** Check 1 needs no new infrastructure — `validate` already scans routes and reads
`public/`; we add a project pass that cross-references `a[href]` against those. Check 2 needs a new data source
(enumerated params), which is why it is its own DL.

## Questions and Answers

**Q1. Why is Check 1 a core pass and not an extension of the seo/a11y plugin?**
A. Resolving an href requires the whole-project route set + public assets; the DL#145 plugin context is
per-file and route-blind. `validate` already owns route scanning (`checkRouteParams`) and `public/` reads, so
the core pass is the low-surface home.

**Q2. Where does Check 1 collect links — source `.jay-html` or rendered HTML?**
A. Source `.jay-html` (the `parsedFiles` `validate` already has). Caveat: it sees flattened `<jay:X>` and
inline templates but **not** links inside non-flattened keyed components, and an href containing a `{binding}`
can't be statically resolved. Handling: skip hrefs that contain `{…}` (classify as "dynamic value — not
checkable here"); accept the non-flattened blind spot (documented). This is acceptable because site navigation
is overwhelmingly hand-authored literal `<a href="/…">`.

**Q3. How are URLs normalised for matching?**
A. Reuse the normalization `generate-sitemap.ts:55-64` already applies (collapse `//`, drop trailing `/`,
empty → `/`). For same-origin absolute URLs, strip the `site.baseUrl` origin first; for relative hrefs,
resolve against the current page's route URL.

**Q4. Approach for Check 2 — (a) build-time output check, (b) agent-kit slug reference, or (c) defer?**
A. **(c) park it.** Ship Check 1 as the complete v1. The deciding factor is **not** build-vs-agent-kit — it is
that **both options are inherently slow**: enumerating every dynamic slug/param means running every route's
`loadParams` (filesystem walks, CMS/network calls, custom content steps). That makes Check 2 a **slow gate**,
and adding a second, slower feedback gate to the agent/author loop has a **high price** — it must not run on
every `validate`. The right pattern (when to run it, how to cache, on-demand vs. scheduled vs. pre-commit) is
itself an open design question, so Check 2 gets its own DL rather than a default here.

- **(a) build-time output check** — still useful as a _last-line_ gate, but too late in the loop and exposed to
  post-build route mutation by Jay's slow-render/second server, so not authoritative on its own.
- **(b) agent-kit slug reference** — keeps the check at validate time by consuming a pre-generated reference,
  but the reference generation is the slow part and goes stale after any content change (e.g.
  `npm run sync:design-log`), so it needs a freshness/regeneration story.
- **Upside that justifies eventually paying the cost:** once we _do_ enumerate concrete dynamic instances, the
  same slow gate unlocks far more than link-checking — **per-instance dynamic-page validation**: meta tags
  correctly reflecting each page, full SEO over dynamically-rendered content, a11y on real content, etc. So
  Check 2 should be scoped as "dynamic-page validation (incl. links)," not "dynamic link checking." Parked —
  see the Parked section.

**Q5. Severity?**
A. **Error** for every unresolvable internal link (degenerate, typo, missing static page). Escape hatch: the
standard `application/jay-validations` suppression for the rare intentional `<a href="#">` (prefer `<button>`).

## Design — Check 1 (this DL)

A new core project-level pass in `validateJayFiles`, after the per-file loop (beside NO-DESIGN-SYSTEM):

```
buildResolvable():
  routes   = await scanRoutes(scanDir, …)                 // patterns only, cheap
  static   = { normalize(concreteUrl(r)) for r in routes if allSegmentsStatic(r) }
  dynamic  = [ toExpressMatcher(r) for r in routes if hasDynamicSegment(r) ]
  assets   = { "/" + relPath for relPath in walk(config.publicFolder ?? "public") }
  resolvable = static ∪ assets

checkLinks():
  for each parsed page P (output URL P.url):
    for each <a href> in P.body:
      href = raw attribute value
      if href contains "{"                          : continue   // dynamic value — not statically checkable
      if isExternalOrigin(href, site.baseUrl)       : continue   // out of scope
      if href starts "#" | "mailto:" | "tel:" | "javascript:" : continue
      target = normalize(resolve(href, P.url))               // + strip site.baseUrl origin if same-origin
      if target ∈ resolvable                        : continue   // ok (static page or asset)
      if dynamic.some(m => m.matches(target))        : continue   // matches a dynamic pattern → DEFER to Check 2
      report ERROR: "Broken internal link \"{href}\" on {P.url} — no page or asset produces this URL."
```

Key points:

- **Degenerate hrefs** (`#`, empty) fall straight through to the error (they match no static route, no asset,
  no dynamic pattern). No separate rule needed — the resolve step subsumes the DL#145-style check.
- **Dynamic-pattern links are silently allowed in v1** (deferred), so Check 1 never false-errors on
  `/blog/first-post`. When Check 2 lands, the `dynamic.some(...)` branch becomes "match against the enumerated
  slug set from the agent-kit reference" instead of "accept any pattern match."
- **No new runtime, no plugin-API change.** New code: `scanRoutes` call + static-URL construction + a
  `public/` walk + the href resolve/match loop, all inside `validate`.

## Implementation Plan (Check 1 only)

**Phase 1 — resolvable set:**

1. In `validate`, call `scanRoutes(scanDir)`; partition into concrete static URLs vs dynamic matchers (reuse
   `route-to-express-route`). Build the `public/` asset set (respect `config.publicFolder`, default `public`).

**Phase 2 — link check pass:** 2. Add the project-level pass (model: NO-DESIGN-SYSTEM) that walks each parsed page's `a[href]`, applies the
skip rules (external, `#`/`mailto:`/`tel:`/`javascript:`, `{binding}` hrefs), resolves + normalizes, and
emits an **error** for anything not in `resolvable` and not matching a dynamic pattern. 3. Emit a clear message with the href and the owning page URL.

**Phase 3 — tests:** 4. Fixture project asserting: `#`/empty → error; `/typo` → error; link to existing static page → ok; link to
missing static page → error; `/images/x.png` present in public → ok; external `https://…` → ignored;
`/blog/{id}` binding href → ignored; link matching a dynamic pattern → **ok in v1 (deferred)**. Assert on
`ValidationResult` fields (not console strings; not `toContain`).

**Phase 4 — live validation + agent-kit:** 5. Run `validate` on jay-website; confirm it flags the footer `#` placeholders and any missing-static-page
links; fix them as the acceptance demo. (The `wix/index` link is Check 2 — remains uncaught until that DL.) 6. Agent-kit: document the rule in `validation-guide.md` (Errors vs Warnings) and the designer link-authoring
guide; note the dynamic-link blind spot so agents know it is deferred.

**Parked — Check 2 (own DL):** see the Parked section below.

## Parked — Dynamic-Page Validation (incl. link checking)

> **De-parked → see [DL#211 — Build-Output Validation](211%20-%20build-output%20validation.md).** The execution-pattern
> question below is answered there: read an **existing build's** artifacts (`route-manifest.json` + per-instance
> `*.cache.json`) in a **separate, opt-in `validate --from-build` tier**, so the slow enumeration is amortized into
> the build and the hot `validate` loop stays fast. The section below is retained as the original parking rationale.

Check 2 is **parked**, not just deferred — it carries an unresolved design question, not merely unwritten code.

- **Core problem:** confirming a dynamic-pattern link (and anything else about a dynamic page) requires the
  enumerated concrete instances, which only `loadParams` produces. That enumeration is **slow** (filesystem /
  CMS / network / custom content steps) regardless of whether we drive it from a build (approach a) or from an
  agent-kit pre-generation step (approach b).
- **Why it can't just be bolted onto `validate`:** a second, slow feedback gate in the agent/author loop is
  expensive. The open design question is the **execution pattern** — on-demand vs. scheduled vs. pre-commit
  vs. CI-only; caching + freshness after content changes; how to surface results without slowing the fast loop.
- **Why it's worth eventually building:** once concrete instances are enumerated, the same gate generalises
  beyond links to **per-instance dynamic-page validation** — meta tags reflecting each page, full SEO over
  dynamic content, a11y on real content. Scope the future DL as "dynamic-page validation," with broken-link
  checking as one consumer.
- **Known inputs for that DL:** approaches (a)/(b) above (neither authoritative alone); the DL#175 sitemap
  oracle (a); DL#204 agent-kit generated-reference precedent (b); the custom-content-step staleness caveat.

## Examples

✅ **Caught now (Check 1):** `<a href="#">Privacy</a>`, `<a href="/pirvacy">`, `<a href="/does-not-exist">`
(no static route) → errors.

✅ **Allowed now:** `/images/logo.svg` (public asset), `/about` (static page exists), `https://wix.com`
(external), `#top` (fragment), `/blog/{slug}` (binding href), `/design-log/wix/index` (**matches dynamic
pattern `wix/[slug]` → deferred to Check 2**, not errored in v1).

🔜 **Caught after Check 2 (own DL):** `/design-log/wix/index` once the agent-kit slug reference shows `index`
is not among the generated `wix` slugs.

## Scope Pre-Mortem (what this does NOT handle)

- **Dynamic-pattern-matching links** (`/design-log/wix/index`) — **parked** (see Parked section); needs the
  slow enumeration gate. The reported `wix/index` bug stays uncaught until that DL — called out explicitly, not
  silently dropped.
- **External link liveness** — network-bound, flaky. Defer (possible opt-in `--check-external`).
- **`#fragment` target existence** — needs a per-page id oracle. Defer (own DL).
- **`{binding}` hrefs at validate time** — not statically resolvable; skipped. Covered later only if Check 2 /
  a rendered-HTML check is added.
- **Links inside non-flattened keyed `<jay:X>`** — invisible to source-level validate. Accept as a documented
  blind spot.
- **Runtime-constructed links** (built in JS) — out of scope for static analysis.

## Verification Criteria

1. `validate` on jay-website errors on the footer `href="#"` anchors and on any link to a non-existent static
   page, and exits non-zero.
2. `validate` does **not** error on valid static-page links, public-asset links, external links, `{binding}`
   hrefs, or links that match a dynamic route pattern (the `wix/[slug]` family) — the latter deferred, not
   flagged.
3. Fixture tests pass with the exact partition in Phase 3.4.
4. No change to existing route-param or sitemap behaviour.

## Trade-offs

- **Deferring Check 2 means the originally-reported `wix/index` bug is not yet caught** by v1. Accepted: v1
  catches the larger, simpler class (degenerate + static) immediately with zero new infrastructure, and Check
  2's correct solution (approach b) needs its own design (agent-kit generation + custom-pre-step handling)
  rather than the compromised approach (a).
- **Validate-time + source HTML** means the non-flattened-component and `{binding}`-href blind spots exist. A
  build-time rendered-HTML check would close them but was rejected for Check 2's purpose (too late; post-build
  mutation); the same reasoning keeps v1 at validate time for fast feedback.
- **Error (not warning) severity** may surprise authors mid-edit with intentional `#` placeholders; mitigated
  by the standard suppression and the guidance to use `<button>` for JS-driven anchors.

---

## Implementation Results (Check 1) — Implemented

Shipped Check 1 as designed. Check 2 remains parked.

**What landed**

- New module `packages/jay-stack/stack-cli/lib/check-internal-links.ts` — pure, testable functions:
  `buildRouteOracle(pagesBase)` (via `scanRoutes`, partitions concrete URLs vs. dynamic matchers, resolving
  DL#156 `inferredParams`), `collectPublicAssets(publicFolder)`, `classifyHref(raw, baseUrl)`,
  `normalizePath`, and `checkInternalLinks({parsedFiles, oracle, assetUrls, baseUrl})`.
- Wired into `validateJayFiles` (`validate.ts`) as a core project-level pass right before the plugin
  validators (mirrors the NO-DESIGN-SYSTEM precedent). Findings are pushed as `stage: 'generate'` errors with
  `source: 'internal-links'` (so they print in the core section and are test-filterable). Uses the existing
  `scanDir`, `config.site?.baseUrl`, and `resolvedConfig.devServer.publicFolder`.
- Added dependency `@jay-framework/stack-route-scanner` to stack-cli.
- Per-page escape hatch: `jay-stack: allow-broken-links: true` in `<script type="application/jay-validations">`.

**Deviations from the design**

- **Confirmed home = core (not seo-validator).** Raised during implementation; re-affirmed: the DL#145 plugin
  context (`plugin-validators.ts:25-52`) is per-file/route-blind, so a plugin can't resolve routes without
  widening the plugin API for everyone. Kept in stack-cli core.
- **Degenerate `#`/empty is severity error**, folded into the same resolve pass (no separate rule) — matches
  the Q5 decision; the DL TL;DR's earlier "warning" framing for the degenerate case was superseded by the
  user's "expand Check 1, error severity" direction.

**Tests** — `test/check-internal-links.test.ts`, 11 tests, all green. Covers `normalizePath`, `classifyHref`
(degenerate / fragment / binding / scheme / external / same-origin / root-relative), `buildRouteOracle`
(static vs. dynamic partition + single-param arity), `collectPublicAssets` (+ missing folder), the
`checkInternalLinks` exact-finding set, and the suppression path, plus an integration test through
`validateJayFiles`. Full stack-cli suite: **145/145 pass**; `build:check-types` clean; `build` clean.

**Verification criteria status**

1. ✅ Live run against jay-website flags the footer `href="#"` placeholders (33 findings across pages — the
   footer is inlined into every page) and exits non-zero.
2. ✅ No false positives: **zero** "Broken internal link" errors on real route links; `/design-log/wix/index`
   correctly deferred (matches `/design-log/wix/[slug]`). (The two extra errors in the live run were
   environmental — wix plugins unresolvable when running the dev CLI outside jay-website's `node_modules`.)
3. ✅ Fixture tests pass with the exact partition.
4. ✅ Existing route-param/sitemap tests unchanged (145/145).

**Follow-up (not in this DL):** the jay-website footer `#` placeholders (Security Policy / Privacy) are real
dead links to fix in that repo — now surfaced by validate.

### Refinements (post-review)

Three follow-ups applied after the initial Check 1 land, per user direction:

1. **Broken static link stays an error** (confirmed — it already was; `stage: 'generate'`, so it blocks the
   build with `--strict` and prints in the core section).
2. **Message points at the fix**: the broken-link suggestion now reads _"Create a placeholder page/route for
   `<url>`, or remove the link. Otherwise &lt;suppress hint&gt;"_ — giving the two real resolutions instead of a
   generic "fix the path".
3. **Self-link detection**: a page whose `<a href>` resolves to its _own_ route is flagged
   (_"Link points to the page's own route `<url>` — a self-link goes nowhere."_). Implemented via a new
   `RouteOracle.selfUrlByPath` map (`resolve(jayHtmlPath) → concrete URL`) built in `buildRouteOracle`;
   `checkInternalLinks` resolves each page via `projectRoot + relativePath` and compares before the
   static/asset/dynamic checks. Suggestion: remove the link, use an in-page `#` fragment, or point elsewhere.

**Tests** — `test/check-internal-links.test.ts` now **12 tests** (added a self-link unit test; integration
fixture gains a self-link on `/about`). All green; `build:check-types` + `build` clean.

**Live re-verify (jay-website)** — 33 placeholder `#`, **12 self-links** (active nav items in the shared
header/footer linking to the current page), **0** false "Broken internal link" errors (`/design-log/wix/index`
still correctly deferred to the dynamic matcher).
