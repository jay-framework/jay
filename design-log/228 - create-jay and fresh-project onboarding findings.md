# Design Log #228 — create-jay and fresh-project onboarding: findings from agent end-to-end runs

**Status: [Design]** — findings + proposed fixes, awaiting review. One item (F1) is already fixed on a branch.

## Decisions for the Implementer (TL;DR)

1. **A freshly scaffolded project must pass `jay-stack validate` and `tsc` with zero errors.** Today it fails both (F2, F3). Add a create-jay test that scaffolds every template/plugin combination and runs both — that is the validation that keeps this from regressing.
2. **`--plugins` matching is case-insensitive and fails on unknown names (F1)** — already fixed in create-jay (`lib/match-plugins.ts` + test), not yet published.
3. **Fix the builder type, not the docs (F3):** the `'Props'` builder state should also expose the next-state methods (`withServices`, `withSlowlyRender`, …) so the documented `makeJayStackComponent<C>().withSlowlyRender(...)` type-checks. Runtime already allows it.
4. **`jay-stack setup` must init a plugin before its own setup when setup needs the plugin's services (F5).** Today init runs only *after* setup returns `configured`, so a setup handler that calls `getService()` on a service its own init registers can never succeed.
5. **Slow-phase data read from files is invisible to dev reload (F4).** Prefer a documented, deterministic answer over silent staleness: an agent-kit note now, a declared-dependency API later.

## Background

While recording end-to-end demos of agent-driven source editing, an agent (and a human following the docs) built fresh projects with `npm create jay@latest` / `node create-jay/dist/index.js --name … --plugins …`, added a page whose list comes from a JSON file, and ran the dev server, `validate`, and `tsc`. Each finding below was reproduced on published `0.25.5`.

## Findings

### F1 — `--plugins` silently ignored documented names — ✅ fixed (unpublished)
- `create-jay/lib/index.ts` compared the raw requested name against `p.name` or `p.label.toLowerCase()`; the request was never lower-cased. The get-started page's own example (`--plugins "UI Kit,SEO validator,Design system validator"`) therefore selected **nothing**, with no error.
- Fix (commit `6a00cbe3`, branch `fix/create-jay-forms-and-matching`): case-insensitive match, hard error listing available plugins on unknown names, vitest coverage. Verified: `--plugins "Wix Stores,Not A Plugin"` → `Error: unknown plugin(s): Not A Plugin`, no project created.
- **Still open:** publish it; parallel `npm view` version resolution can pin mismatched versions (tracked separately).

### F2 — Fresh scaffold fails `jay-stack validate` (2–3 errors)
- The home `page.jay-html` links to `/aiditor` (twice). `/aiditor` is a dev-only plugin route, so broken-link validation (DL#210) reports it as an error.
- The home page imports the `ui-kit` `letter-split` headless component even when UI Kit was not selected → `Plugin "@jay-framework/ui-kit" not found`.
- **Proposed fix:** (a) broken-link validation resolves routes contributed by installed plugins (dev-only routes included, since the link is in a dev-facing starter page) — or the template drops the anchor and prints the URL as text; (b) the template uses `letter-split` only when UI Kit is selected. Add the scaffold+validate test from TL;DR 1.

### F3 — Fresh scaffold fails `tsc`
- `src/pages/page.ts`: `makeJayStackComponent<PageContract>().withSlowlyRender(...)` → `TS2551: Property 'withSlowlyRender' does not exist … Did you mean 'slowlyRender'?`.
- ✅ Root cause (`fullstack-component/dist/index.d.ts:287-288`): the `'Props'` builder state exposes **only** `withProps()`; `withSlowlyRender` appears from the `'Services'` state on. The developer agent-kit (`page-components.md` "Basic Page Component") and the create-jay template both omit `.withProps()`, so the documented usage never type-checks. Runtime works because the builder object has every method.
- `tsconfig.json` ships `"types": []`, so any page that reads files (`node:fs`, `process`) fails to type-check although `@types/node` is installed.
- **Proposed fix:** extend the `'Props'` state with the `'Services'`-state methods (props default to `{}`); ship `"types": ["node"]`. Covered by the scaffold+tsc test.

### F4 — Slow-phase data read from a file never refreshes in dev
- A page reading `data/plants.json` in `withSlowlyRender` keeps serving the old values after the file changes. Importing the JSON as a module does not help either.
- ✅ Cause (`dev-server` `setupSlowRenderCacheInvalidation`): the slow-render cache clears only on route `page.jay-html` / `page.ts` / contract changes and on "linked files", which are only linked CSS and component files. Data files read by a component are never watched.
- Impact: an agent makes the *correct* edit (the data file) and the preview shows nothing — the agent or user concludes the edit failed, and is tempted to hard-code the value in jay-html instead.
- **Proposed fix (priority order):** (1) agent-kit (developer `page-components.md` / `component-data.md`): "slow-phase data read from files is cached in dev until `page.ts` changes; read per-request data in the fast phase, or touch `page.ts`"; (2) framework: let a slow render declare file dependencies (e.g. returned alongside `phaseOutput`) that feed the existing `watchLinkedFiles` path.

### F5 — `jay-stack setup` cannot configure a plugin whose setup needs its own init
- ✅ Cause (`stack-cli/lib/run-setup.ts:139-140`): per plugin, setup runs first and init (which registers services) runs only after setup returns `configured`. A setup handler that validates by calling `getService(<own marker>)` therefore always fails ("… service not available. Run setup for <dependency> first"), on every run — even after its dependencies are configured. The dev server, which runs all inits, works.
- **Proposed fix:** before a plugin's setup, run its init when all of its dependencies are already configured (inits are idempotent registrations); keep the "init after setup" pass for plugins whose init needs the config setup just wrote.

### F6 — Suppression hint is easy to misapply
- The broken-link error suggests ``suppress with jay-stack:\n  allow-broken-links: true`` inside a `<script type="application/jay-validations">` block, printed across lines so the nesting is lost. An agent wrote `allow-broken-links: true` at top level (not under `jay-stack:`), which does not suppress anything — and was reported as a "fix".
- **Proposed fix:** print the suggestion as a complete, copy-pasteable block (`<script type="application/jay-validations">` / `jay-stack:` / `  allow-broken-links: true` / `</script>`), and warn on unknown top-level keys inside `application/jay-validations`.

## Scope — not handled here
- Third-party CLI requirements of individual plugins' setup (owned by those plugins).
- Production behavior of F4 (production has TTL/grace).

## Verification
- create-jay test: scaffold each plugin combination → `jay-stack validate` reports 0 errors and `tsc --noEmit` passes.
- `fullstack-component` type test: `makeJayStackComponent<C>().withSlowlyRender(...).withFastRender(...)` compiles.
- `run-setup` test: a fixture plugin whose setup calls `getService` on its own marker reports `configured` once its dependencies are configured.
- Validation test: top-level unknown key in `application/jay-validations` warns.

## Agent feedback loop
- **Validation:** F2/F3 scaffold test, F6 unknown-key warning.
- **Agent-kit:** F4 note; fix the "Basic Page Component" example if F3's type fix is not taken.
