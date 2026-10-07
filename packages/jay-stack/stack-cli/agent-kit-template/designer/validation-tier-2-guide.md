# Tier 2 Validation — Deep Checks Against a Build

`jay-stack validate` runs **Tier 1**: the fast, template-only gate (links, placeholders, coverage) that needs no
build. See `validation-guide.md` for Tier 1.

**Tier 2** (`jay-stack validate --tier-2`) adds deeper checks that are only possible once a build exists. This
guide covers Tier 2 end to end.

## What Tier 2 is

Deep validation against an **existing build's output** (DL#211). It reads
`build/v<version>/backend/route-manifest.json` plus the per-instance `*.cache.json` slow-render results. It does
**not** run any render, so it's cheap — but it **requires a prior `jay-stack build`**. If no build is found, Tier 2
reports a single actionable error (run `jay-stack build` first, or drop `--tier-2`).

Run it **pre-deploy / in CI**, not in the hot authoring loop.

```bash
jay-stack validate --tier-2                      # validate against the highest build/v* output
jay-stack validate --t2                          # short alias
jay-stack validate --tier-2 --build-dir <dir>    # point at a specific build backend dir or build root
```

Tier 2 findings print under their own `📦 Tier 2 — build-output validation (--tier-2)` section, separate from the
Tier 1 `📦 jay-stack (core)` section.

## The three checks

All run against the concrete URLs the build actually produced (routes × instances).

1. **Deferred dynamic-slug links** (ERROR) — the template links Tier 1 could only defer (because they matched a
   dynamic pattern like `/design-log/[...slug]`) are resolved against the real URL set. A link to a dynamic route
   with a slug the build never generated (e.g. `/design-log/wix/index`) is caught here.

2. **Broken links in rendered content** (WARNING) — `<a href>` found _inside_ the slow-rendered ViewState
   (markdown bodies, descriptions) that resolve to a URL the build does not produce. Relative hrefs are resolved
   against the instance's own URL. These are **warnings**, not errors, because content often doubles as repo/GitHub
   docs where repo-relative links like `../pkg/foo.ts` are legitimately correct.

3. **Per-instance meta/SEO** (mostly WARNING) — resolves each route's `headMeta` template against each instance's
   slow ViewState and validates the concrete `<title>` / `<meta name="description">`:
   - Empty title/description, a title > 60 chars, or a description > 160 chars → **warning**.
   - A leftover unresolved `{binding}` (a field never produced at any phase) → **error**.
   - Note (DL#189): a field bound to the fast/interactive phase is legitimately empty at slow render, so
     **emptiness is only ever a warning, never an error**.

If the build is older than your current source files, a **staleness warning** is emitted ("validated against a
build from &lt;timestamp&gt;; source has changed since") suggesting a rebuild.

## Suppressing Tier 2 findings

Per-page, via the same `<script type="application/jay-validations">` block used for Tier 1, under the `jay-stack:`
key:

- `allow-broken-links: true` — suppresses link findings (both template and rendered-content links) for that page.
- `allow-meta-issues: true` — suppresses meta/SEO findings for that page.

```html
<script type="application/jay-validations">
  jay-stack:
    allow-broken-links: true
    allow-meta-issues: true
</script>
```
