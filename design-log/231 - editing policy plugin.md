# Design Log #231 — Editing policy plugin (`@jay-framework/editing-policy`)

Status: **[Design]**. Cross-cutting context (handover flow, publish job, roles from Wix collaborators) lives in the internal repository; this log covers only what belongs in the open-source framework. **Dependencies verified against the codebase 2026-11-08 — see §12 for the ✅/⚠️ readiness table and exact anchors.**

## 1. Decisions for the Implementer (TL;DR)

1. **New open-source plugin package** `packages/plugins/editing-policy` (`@jay-framework/editing-policy`). It owns the policy file format, the policy-file validation, and the baseline-vs-candidate comparison engine. Nothing in it is Wix-specific.
2. **Policy-file validation is part of the regular `jay-stack validate`**, via the **`projectValidators` hook owned by DL#232** (not re-specified here; **DL#232 P0 is a prerequisite** — see §6.5). The **`compare` command ships as a standalone `bin`** that calls the library entry directly — *not* a `jay-stack run` plugin command: ✅ verified `run` boots a full Vite server + the jay-stack compiler + project/plugin service inits before the handler (so it cannot run install-free) and a command handler can only `exit 0/1` (it cannot emit the 0/10/11 dispositions). See §6.3 and §12.
3. **The engine is pure: two directories + a role in, findings out.** It never runs git, never installs, never reads the network. **The CLI does no git operations either**: the caller (e.g. the publish job) checks out the baseline and candidate into two directories and passes them in.
4. **The policy is read from the baseline**, never the candidate. A change to the policy file in the candidate is itself a classified change (`policy`), governed by the explicit `policy` rule (default: denied).
5. **The role is an input** (`--role <name>`). Mapping a Wix collaborator to a role is the caller's job and stays out of this package.
6. **Dispositions** `PUBLISH` / `REVIEW` / `BLOCK` (strictest wins). Exit codes: `0` PUBLISH, `10` REVIEW, `11` BLOCK, `1` tool error.
7. **Output is markdown by default, `--json` for machines.** The markdown report (disposition, findings with suggestions, change summary) is readable by a person and directly usable as agent input; `--json` returns `{disposition, findings[], changes}`. The LLM evaluator is **not** in this package (model runner and credentials) and `compare` has no input for external findings: a caller that runs an LLM step consumes the report or JSON (`changes` is the structured change summary) and combines the verdicts itself.
8. **Agent guidelines come from the same file.** The markdown body of the policy file is the agent guideline text; the plugin exposes it through the agent-kit so the authoring agent reads the same policy the validator enforces.

## 2. Background

Handover needs two enforcement points over one policy: guidance to the authoring agent, and an enforcement check on the work before it reaches production. Jay already has the pieces for "validation as an extension": per-file jay-html validators declared in `plugin.yaml` (DL#145, ✅ read `seo-validator/plugin.yaml`: `validators: [{name, handler, description}]`) and plugin CLI commands (DL#142, ✅ `jay-stack run [plugin/command]` in `stack-cli/lib/cli.ts`). Priority order from CLAUDE.md applies: validation first, docs second, framework feature last. This design adds **no framework feature** beyond what plugin commands already give, unless the open questions below say otherwise.

## 3. Problem

Existing validators check one tree in isolation, one jay-html file at a time (DL#145 Q4). A policy decision needs the **difference** between two project trees (what changed on which page, section, contract, style token, or dependency) and the **policy of the baseline**. Neither the validator hook nor `jay-stack validate` has that shape.

## 4. Prior Art / Adjacent Mechanisms

| Mechanism | Solves | Constrains |
| --- | --- | --- |
| DL#145 plugin validators | Per-file jay-html checks, `suggestion` field for agents | Single tree, jay-html only: cannot see a diff or a markdown policy file |
| DL#142 plugin CLI commands | Plugin-defined commands with typed input (`.jay-command`) | ⚠️ `run` initializes project services and a vite server before the handler runs; heavy for a pure two-directory command, may need credentials/config |
| `jay-stack validate --json` | Findings with suggestions, exit code | Not role- or diff-aware |
| DL#151 design-system validator | Static CSS analysis with token parsing; reusable by the engine for design changes | Single tree |
| Agent-kit | Delivery of guidance to the agent | Static docs, not a per-project policy (the plugin supplies the policy text) |

Null hypothesis: could `validate` plus a git diff in a shell script do it? A diff of text lines cannot be matched to selectors (`src/pages/products/[slug]/page.jay-html#pricing-card`), role rules (`design` vs `content`), or contract changes. The engine needs semantic classification of changes; that is the new code, and it is a plugin library, not a framework change.

## 5. Questions and Answers

- **Q1. Where does the code live?** A. Jay mono repo, `packages/plugins/editing-policy`. Open source because the policy format and change classification are framework concepts; enforcement strength comes from where it runs and which policy it reads, not from secrecy of the format.
- **Q2. Plugin validator hook or CLI commands?** A. Split. Policy-file validation is a validation, so it goes through `validate` via the **`projectValidators` hook defined in DL#232** (✅ verified absent from code today; DL#232 owns it, #231 is its first consumer). `compare` takes two trees and ships as a **standalone `bin`**: ✅ verified `jay-stack run` boots a full Vite server + the jay-stack compiler + project/plugin service inits (SSR-loading `src/init.ts`) before the handler (`run-command.ts:109,116,141`) — it cannot run on a sterile machine — and a handler can only return `{success}` → `process.exit(0|1)` (`run-command.ts:143`), so the required 0/10/11 exit codes are impossible there. The bin calls the library entry (`comparePolicy`) directly. (This was the DL's "fallback"; it is now the primary and only path.)
- **Q3. Should git be inside the engine?** A. No. Pure directories keep fixture-based tests, local use, and any CI possible. Checkout of the two trees is the caller's job (the publish job script), not the CLI's.
- **Q4. Baseline/candidate naming.** A. `--baseline` / `--candidate` (directories). Alternatives considered: `base`/`head` (git-style, but "head" is ambiguous with HEAD), `before`/`after`. Rename if you prefer.
- **Q5. Policy edits by contributors.** A. Always evaluated against the baseline policy, so a candidate cannot loosen its own rules. Changing the policy file or a `jay-policy` marker needs the explicit `policy` rule (default denied, §6.1), so granting it is a deliberate designer decision per role.
- **Q7. Selector syntax and root.** A. Root is the project root; one selector kind (file-path glob, optional `#name` section). Routes are folders under `src/pages`, so no separate route syntax.
- **Q10. Sync by clients.** A. **Confirmed:** a change that makes a region equal to its current template source is a `sync`, allowed for any role (a re-flatten adds no designer-unauthorised content).
- **Q11. Template marker and closest-match search?** A. Dropped: the region's `template=` provenance is the explicit marker (DL#196); templates are components under `templates` globs.
- **Q9. Policy marker.** A. `jay-policy="<name>"` on a plain element or a region tag (decided): not HTML `id` (unique per document, breaks under `forEach`), not the region tag name (several regions share it); the name belongs to the instance, so two `<jay:card>` regions can have different permissions.
- **Q8. Negative rules?** A. No new syntax: a more specific selector with `<rule>: no`; unset rules are denied for non-admin roles.
- **Q6. Where does the LLM step live?** A. Outside this package (credentials, model runner). The package defines the change-summary and finding shapes; the caller combines any LLM verdict with the `compare` result.

## 6. Design

### 6.1 Policy file (`jay-policy.md`, project root)

YAML frontmatter + markdown body. **All rules hang off selectors.**

```yaml
version: 1
defaultRole: client
templates: ["src/components/templates/**"]   # components that are templates (see below)
correctness:            # every role, including admin
  validate: true        # candidate must pass `jay-stack validate`
roles:
  developer:            # full access to everything
    - selector: "**"
      rules: { code: yes, css: yes, content: yes, design: yes, dependencies: yes, config: yes,
               create: yes, delete: yes, rename: yes, policy: yes, publish: direct }
  designer:             # design work and new pages only
    - selector: "**"
      rules: { design: yes, css: yes, content: yes, create: yes,
               code: no, dependencies: no, config: no, delete: no, rename: no,
               policy: yes, publish: direct }          # may mark parts with jay-policy ...
    - selector: "jay-policy.md"                        # ... but not edit the policy file itself
      rules: { policy: no, onViolation: block }
  client:
    - selector: "**"                              # baseline for the client
      rules: { code: no, css: no, config: no, dependencies: no, content: yes,
               design: designSystemOnly, create: from-template, delete: no, rename: no,
               publish: review, onViolation: review }
    - selector: "src/components/templates/**"     # templates are the designer's, not editable by the client
      rules: { edit: no, onViolation: block }
    - selector: "src/pages/legal/**"              # negative rule = more specific selector with `no`
      rules: { edit: no, onViolation: block }
    - selector: "src/pages/page.jay-html#pricing-card"   # <jay:card jay-policy="pricing-card">
      rules: { design: no, content: yes }
    - selector: "src/pages/page.jay-html#promo-card"     # another <jay:card> in the same file
      rules: { edit: no, onViolation: review }
    - selector: "src/pages/**/page.jay-html#price-note"  # a plain element marked jay-policy="price-note"
      rules: { edit: no, onViolation: review }
    - selector: "src/components/**"               # shared components
      rules: { design: designSystemOnly, content: yes }
```

**Templates are regions (DL#196).** A template is an ordinary component in the components folder (contract, optional `.ts`, `.jay-html`), listed by the `templates` globs (default `src/components/templates/**`). It is used the same way as any design-system element: the page imports it with `template=` provenance on its `application/jay-headless` script and flattens it into the page as a `<jay:X>` **region** (DL#196 materialise/`jay-stack sync`; variants through `as=`, DL#205). **The region and its `template=` provenance are the template marker**; the agent must include them, so nothing has to guess which template a page came from and there is no "closest template" search.
- **Creation.** `create: from-template` permits a new page (a new folder under `src/pages`) or a new section only if the new page/section **contains a region whose `template=` resolves to a component matching `templates`**. A page or section with no such region is a `create` violation. Markup in the new page **outside** template regions is an ordinary added change, judged by the role's `design`/`content` rules (client: `design: designSystemOnly` rejects raw layout, accepts more regions).
- **Classification of region edits**, for this region from the DL#196 example:

```html
<jay:card heading="{title}">
    <div class="card">
        <h3 class="card-heading featured" override="class">{heading}</h3>
        <p class="card-body">Default body</p>
    </div>
</jay:card>
```
- `heading="{title}"` (a prop on the region tag; literal or a binding to page data) = `content`.
- `<p>` text changed to "Default body" = `content` if the template node is a `jay-content` slot; otherwise it is a structural/static-text drift = `design`.
- `class="card-heading featured"` with `override="class"` = a `design` change (class facet differs from the template). `override=` makes the drift intentional for `validate`, not permitted by policy: `design: designSystemOnly` allows adding regions and design-system tokens, not editing classes of an existing element, so a client gets a `design` finding; a designer/developer role passes.

**Edits inside the region** reuse the DL#196 facet differ: region body vs the template's current source. ✅ verified the reusable engine is `@jay-framework/compiler-inline-composition` — `diffBodies()`/`diffCss()` returning facet-granular `DiffEntry[]` (`facet`, `change`, `addedElementTags` for content-vs-structural), with `isContentSlot()`/`parseContent()` for `jay-content` slots (DL#202) — **not** `checkRegionDrift` (that is test-only/private in `stack-cli`, not exported). Each differing facet becomes a change judged by the role: text/children under a `jay-content` slot (DL#202) = `content`; an `override`-marked or unmarked structural, attribute, or style facet = `design`/`css`. So a client may fill in content slots (`content: yes`), swap in design-system elements, and cannot restructure the region (`design: designSystemOnly`). Unmarked drift is still a `validate` warning (DL#196) and also counts as a change here; marking it `override` does not grant permission.
- **After the page exists** (in `main`), nothing special: later edits are diffs against `main`, judged by the selectors matching the page's path, and the region keeps being drift-checked against its template. Copy semantics, no link: a later template change reaches a page only through `sync`.
- **`sync`.** A candidate change that makes a region **equal to its current template source** (a re-flatten) adds no designer-unauthorised content, so it is classified `sync`, not `design`, and is allowed for any role (Q10 confirmed).
- **Policy names in instances:** `jay-policy` attributes inside a template body are copied into every instance verbatim, so a glob such as `src/pages/**/page.jay-html#hero` constrains that part on every page created from the template; the region tag's own `jay-policy` is set by whoever places the region (a designer, since adding it is a `policy` change). Selectors naming the template itself govern the template, not its instances.

Without a matching `templates` glob, `from-template` can never be satisfied (the policy check errors if any role uses `create: from-template` or `overrideRoute: from-template` and `templates` is absent or matches no component).

**One selector kind: a glob over project-root-relative file paths, optionally followed by `#<name>` to target a section.** Routes are folders under `src/pages`, so a route is addressed by its folder (`src/pages/products/[slug]/**`), the home page by `src/pages/page.jay-html`. No separate route syntax, no collision between route and file selectors, and root files (`package.json`, `jay.config.*`) are addressed the same way. `**` matches everything.

**Policy names (`#<name>`).** To give part of a page its own permissions, mark it in the `.jay-html` source with a **`jay-policy="<name>"` attribute**, on **either a plain element or a region tag**:

```html
<jay:card jay-policy="pricing-card" heading="Starter">...</jay:card>
<jay:card jay-policy="promo-card" heading="Sale">...</jay:card>
<p jay-policy="price-note">Prices exclude VAT.</p>
```

The selector is `<file glob>#<name>`, e.g. `src/pages/page.jay-html#pricing-card`. Optional shorthand: `<folder>#<name>` means that folder's `page.jay-html`. Two `<jay:card>` regions in one file are addressed independently because the name is on the instance, not derived from the tag or the template. Explicit attribute, not HTML `id` (ids are unique per document; a marked part can sit under `forEach`) and not the region tag name (several regions share it).
- **What is governed:** the marked element's whole subtree, or the whole region (its tag attributes/props and body). Rules by file type as in the table below; for regions, edits are classified as in "Classification of region edits".
- **Unmarked parts** fall to the file's path selectors (e.g. `src/pages/**`).
- **Names are local to their file.** `price-note` in two files are two unrelated policy groups, and a glob selector applies to all of them. The same name may be repeated within a file (the elements form one policy group governed alike), which also covers a marked element under `forEach` or a template-provided marker copied into every instance.
- **The value is static** (a literal, no bindings). The engine reads **template source**, not rendered output.
- **Defined by the baseline.** The engine finds `jay-policy="pricing-card"` in the baseline file and in the candidate file and compares the two subtrees. A change inside is attributed to the **innermost** baseline policy-marked element or region that contains it; anything outside falls to the file's path selectors.
- **The attribute itself is protected.** Adding, removing, or changing a `jay-policy` attribute is a `policy` change and needs the **`policy` rule** (below) for that role on that part; removing a marked element or region is a `delete` of that group member. A candidate cannot shed or grant itself rules by editing markers, and rights come only from the baseline policy anyway.
- **New elements or regions** are evaluated where they are inserted (inside a baseline marked part → that part's rules; elsewhere → the file's). A new element carrying an existing name is a `create` in that group and needs the role's `create` right.
- **Moving content between marked parts** is a removal from one and an insertion into the other; both are evaluated.
- A `#name` selector on a file that is not `.jay-html` is an error; `validate` warns when a selector's `#name` is absent from the baseline file (for a glob: when **no** matched file has it).
- **Inline rules were rejected:** the attribute carries only a name, never rules (`jay-policy="design:no"`), because rules must come from the baseline policy and per role, and the marker is editable page source.
- **Compiler and parser hygiene (✅ verified anchors).** `jay-policy` is read only by the policy engine. There is no single skip point — the earlier draft's `jay-html-parser.ts:878` reference is **stale** (that line is the headless-import loop; the prop-vs-directive decision lives in the compiler, not the parser). Three distinct spots must learn `jay-policy`:
  1. Add `'jay-policy'` to the `DIRECTIVE_ATTRIBUTES` set (`compiler-jay-html/lib/jay-target/jay-html-compiler-shared.ts:120`) — strips it from element- and server-target rendered HTML, for both plain elements and region tags.
  2. Add a `jay-policy` early-return in `renderChildCompProps` (`compiler-jay-html/lib/jay-target/jay-html-compiler.ts:433`) — otherwise it becomes a bogus component prop on a `<jay:X>` region tag (one add; this function also serves the hydrate + bridge targets).
  3. Add `'jay-policy'` to `META_ATTRS` (`compiler-inline-composition/lib/override.ts:38`, beside `jc`/`override`/`page-scope`/`jay-content`) — so it rides through flatten/diff as meta and is never diffed as content. **This** is the mechanism DL#196 actually uses (not the parser).
  4. **React target: out of scope.** It has a *separate* hardcoded skip list (`compiler-jay-html/lib/react-target/jay-html-compiler-react.ts:121`); we intentionally do **not** update it — `jay-policy` on React output is a non-goal.
  ✅ verified there is no unknown-attribute/unknown-prop validation, so `jay-policy` is never rejected — the only risk is silent emission, which the adds above prevent. The designer agent guide must say to add `jay-policy` to every part a policy may need to control separately.

**Rules** (what each governs is decided by **file type**, not by selector):

| Rule | Values | Governs |
| --- | --- | --- |
| `content` | yes / no | Text content in `.jay-html` |
| `design` | yes / no / designSystemOnly | Layout, structure, classes, inline styles in `.jay-html`; `designSystemOnly` = only design-system tokens and elements |
| `css` | yes / no | CSS inside `.jay-html` and external `.css` files |
| `code` | yes / no | `.ts`, `.js` and `.jay-contract` files (a new contract is a `code` change with `create`) |
| `dependencies` | yes / no | Dependency fields of `package.json` and the lockfile. Selector must match the root manifest (`**` or `package.json`) |
| `config` | yes / no | Other non-source project files: scripts and metadata in `package.json`, `.yaml`/`.json` project and plugin config, env files ⚠️ proposed, not in the original vocabulary |
| `create` | yes / no / from-template | Creating files, pages (a new folder with `page.jay-html`) or sections; `from-template` = only by building from a template region (`templates`, above) |
| `delete` | yes / no | Deleting files, pages or sections |
| `rename` | yes / no | Renaming or moving files, pages or sections (a route change is a `rename` of the page folder) |
| `overrideRoute` | any / from-template / no | Page folders that override a plugin-owned route (`from-template` uses `templates`) |
| `policy` | yes / no | Changing `jay-policy` markers (on the selector's matching parts) and the policy file (selector `jay-policy.md`). Default **no** for every role except `admin` |
| `edit` | no | Freezes the selector entirely (any change, any type) |
| `publish` | direct / review | Whether a passing change publishes directly or goes to the admin |
| `onViolation` | review / block | Disposition when a rule on this selector is violated |

No asset rule: images and media are not governed.

**Resolution.** For each change, find all selectors of the role that match it. Per rule, the **most specific** matching selector decides: `#name` section > more literal path segments > fewer (globs last). Equal specificity: the stricter value wins. Rules no matching selector sets are **denied** for non-admin roles (fail closed). Negative rules are just a more specific selector with `<rule>: no`. Across rules, the strictest `onViolation` wins: `block` > `review` > publish.

The policy file itself (`jay-policy.md`) and the `jay-policy` markers are governed by the `policy` rule, never implied by `edit`, `design` or `code`. Default denied for every role except the reserved `admin`.

### 6.2 Policy file validation (runs in `jay-stack validate`)

A project-level validator (§6.5) runs when `jay-policy.md` exists in the project. Same `Finding`/`suggestion` output as other validators. Fails on: bad YAML or unknown `version`; unknown rule keys or values; unparsable selectors; **a rule used on a selector that cannot carry it** (`dependencies` on a selector that cannot match the root manifest, `#name` on a non-`.jay-html` file, `overrideRoute` on a selector outside the pages folder); duplicate or contradictory selectors in one role; roles with no `*` fallback (warning); selectors that match no route or section in the project (warning, tells the author which); markdown body missing (warning, agents get no guidelines); a non-`admin` role with `policy: yes` on `jay-policy.md` (warning: it can loosen the rules that govern later publishes; the change only takes effect once published from a role allowed to). Findings use the same `Finding` shape and `suggestion` field as DL#145.

### 6.3 `compare` (standalone `bin`)

Ships as a dedicated bin (declared in `package.json` `bin`) that calls the library entry (`comparePolicy`) directly — pure, no Vite, no install, no network — so it can map the disposition to exit codes (§1.6). See §6.5 / §12 for why this is not a `jay-stack run` command.

```
editing-policy compare
   --baseline <dir>                                  # the project tree to compare against (e.g. main)
   --candidate <dir>                                 # the proposed project tree
   --role <name>  [--policy <file>]                  # role required unless the policy sets defaultRole; policy default: <baseline>/jay-policy.md
   [--json]                                          # default output: markdown report
```

Pipeline, in order, cheapest first, no install:

1. **Load** the policy from the baseline. Unknown role → tool error.
2. **Classify changes** between the two trees into `Change[]`: `{kind: content | design | code | css | dependency | config | create | delete | rename | policy, path, route?, section?, summary}`. The file path (and, for `.jay-html`, the baseline section) selects the matching selectors; the file type decides the rule (`.jay-html` → content/design/css, `.ts/.js/.jay-contract` → code, `.css` → css, manifests → dependency, other → config). Content vs design is decided from jay-html text nodes vs attributes/styles/classes; renames are detected by file similarity (git-style) so a moved page is one `rename`, not delete+create (⚠️ no tree-diff/rename utility exists in the repo today — this is net-new engine code); CSS token-vs-arbitrary classification via DL#151's `token-matcher` primitives (`matchColor`/`matchSpacing`/`parseDesignMd`; ⚠️ not currently exported from `design-system-validator/tools` — P1 adds the export or vendors the logic); dependencies from the manifest diff; contracts from `.jay-contract` diff.
3. **Match** each change to the role's selectors and rules; a violation yields a `Finding` with the rule's `onViolation`.
4. **Disposition**: strictest finding wins; no findings → `PUBLISH`.

### 6.3.1 Markdown report

Default stdout, stable section order so agents and humans can rely on it:

```markdown
# Policy comparison: PUBLISH | REVIEW | BLOCK
Role: client · Baseline: main · Candidate: feature-x · Policy hash: 3fa9…

## Findings (2)
### BLOCK — design change in a protected part
`src/pages/page.jay-html#pricing-card` — rule `design: no` (client)
Changed: class list and layout of the pricing-card region.
Suggestion: revert the layout change, or request review from the designer.

### REVIEW — new page not from template
`src/pages/offers/page.jay-html` — rule `create: from-template`
Suggestion: build the page from a template: import one from `src/components/templates` with `template=` and flatten it (`jay-stack sync`).

## Changes (5)
- content: `src/pages/page.jay-html#pricing-card` — heading prop changed
- design: ...
```

Exit code mirrors the disposition (§1.6). Findings text is written for the authoring agent (the `suggestion` field), so the report can be pasted back to the agent as its fix task.

`compare` does **not** install dependencies or run `jay-stack validate`: the caller runs those on the candidate (they need the project environment), and `correctness.validate: true` is satisfied only if the caller passes `--validated <result.json>`; absence with that rule on is a `review` finding. Rationale: the engine stays install-free and safe to run before untrusted scripts.

```ts
type Disposition = 'PUBLISH' | 'REVIEW' | 'BLOCK';
interface Finding { id: string; source: 'rule' | 'llm' | 'validate'; severity: 'block' | 'review' | 'info';
  ruleId: string; selector?: string; path?: string; message: string; suggestion?: string; role: string }
interface CompareResult { disposition: Disposition; findings: Finding[]; changes: Change[]; policyHash: string }
```

### 6.4 Package layout

```
packages/plugins/editing-policy/
  plugin.yaml            # projectValidators: [{name: editing-policy, handler, description}]  (DL#232 hook)
  package.json           # bin: { editing-policy }; exports "." (library) + "./tools" (handler); files: [dist, plugin.yaml, agent-kit]
  vite.config.ts         # vite build --ssr, two-entry (index, tools); test.globals (mirror a11y-validator)
  tsconfig.json          # extends @jay-framework/dev-environment/library-dom/tsconfig.json
  lib/index.ts           # serve entry (DL#179) — empty (`export {}`) for a validator/engine-only plugin
  lib/tools.ts           # toolchain entry: re-exports the policy-file validator handler
  lib/api.ts             # library entry: parsePolicy, checkPolicy, comparePolicy
  lib/policy/            # schema, parser, selector matcher
  lib/changes/           # tree differ (net-new) + classifier (reuses compiler-inline-composition diffBodies/diffCss)
  lib/validators/        # policy-file project validator (the projectValidators handler)
  lib/bin/compare.ts     # standalone `compare` bin → comparePolicy, exit 0/10/11/1
  agent-kit/<role>/*.md  # policy guidelines exposed to the authoring agent (directory-scan convention)
  test/fixtures/<case>/{baseline,candidate,policy.md,expected.json}
```

### 6.5 Project-level validator hook — provided by DL#232 (prerequisite)

The `projectValidators` hook is **owned by DL#232**, not by this log (✅ verified absent from code today; #231 is DL#232's first consumer). This DL **consumes** it: the policy-file validator is a `projectValidators` entry in `editing-policy`'s `plugin.yaml`. **DL#232 P0 must land first.** Verified insertion points (DL#232's work, listed so the dependency is concrete):

- Context + `Finding` types next to `JayHtmlValidatorFn` in `compiler-shared/lib/plugin-validators.ts` (the per-file `JayHtmlValidationFinding` already carries `severity`/`message`/`suggestion` — the project-level finding mirrors it).
- Manifest schema check in `plugin-validator/lib/validate-plugin.ts:548` (mirror the `validators` block), plus the capability list (`:346`) and no-capability suggestion (`:376`).
- A `runProjectValidators` pass beside `runPluginValidators` in `stack-cli/lib/validate.ts:1748`, invoked near `:2574` — after the `compileOnly` early-return at `:2344`, so it is automatically skipped under `--compile-only` (DL#232 Q5 / DL#232 crit. #4).

Findings fold into `errors`/`warnings` tagged `source: plugin:editing-policy/<validator>`.

### 6.6 The role parameter

`--role` is required input because the engine cannot know who is publishing: identity-to-role mapping (Wix collaborator role → `client`, `designer`) is the caller's. Rules: an unknown role is a tool error; no role and no `defaultRole` is a tool error (never silently admin); `defaultRole` in the frontmatter is the fail-safe fallback (point it at the most restrictive role); `admin` is reserved, has no role rules, and is still subject to `correctness`.

## 7. Implementation Plan

0. **Prerequisite — DL#232 P0** (`projectValidators` hook): types in `compiler-shared`, schema in `validate-plugin`, `runProjectValidators` in `stack-cli`. Must land before the policy-file validator can register. Tracked in DL#232, not duplicated here.
1. **P0 — compiler attribute hygiene + policy schema/validator.** Add `jay-policy` in the three verified spots (§6.1: `DIRECTIVE_ATTRIBUTES` `jay-html-compiler-shared.ts:120`, the `renderChildCompProps` skip `jay-html-compiler.ts:433`, `META_ATTRS` `override.ts:38`); then the policy schema (parser + selector matcher) and the policy-file validator registered as a `projectValidators` entry, with fixtures (valid / each failure class). `toEqual` on parsed JSON findings.
2. **P1 — change classifier** on fixture pairs (content edit, style edit, new page, dependency bump, contract change, policy edit). Reuse `compiler-inline-composition` `diffBodies`/`diffCss`/`isContentSlot`; add the DL#151 `token-matcher` export to `design-system-validator/tools` (or vendor it); write the file-tree/rename detector (none exists today).
3. **P2 — `compare` bin**: selector matching, dispositions, exit codes 0/10/11/1, markdown report + `--json`; pure library entry, no Vite/install. Live example on `examples/jay-stack/design-system-demo`.
4. **P3 — agent-kit guidelines** from the policy body: drop a `.md` under `agent-kit/<role>/` (✅ directory-scan convention picked up by `jay-stack agent-kit`; no plugin.yaml key). Authoring guide for designers.
5. **P4 — package wiring**: mirror the a11y/seo validator-plugin layout (`lib/index.ts` empty serve entry + `lib/tools.ts` toolchain entry, DL#179; `vite build --ssr` + `tsup` types; `files` includes `agent-kit`); `plugin.yaml` `projectValidators` entry; `yarn install` to register the workspace (root `workspaces` already globs `packages/plugins/*`).

## 8. Scope pre-mortem (not handled)

- LLM evaluation (outside, §1.7). Non-jay projects. Visual merge UI. Role mapping and publish orchestration (internal repository).
- Semantic classification is heuristic at the edges (e.g. a style change that is really content). Default for ambiguous changes: the stricter category, so ambiguity produces `review`, not `PUBLISH`.

## 9. Test plan

Repo standards apply (CLAUDE.md): fixtures as files, `toEqual` on full results (never `toContain`), helpers that return values, one test file per module. Everything runs on directories (no git, install, or network).

### 9.1 End-to-end: two fixtures, rotating policies

```
packages/plugins/editing-policy/test/fixtures/
  baseline/              # a small project = "main"
  candidate/             # the same project with changes
  policies/
    developer-designer-client.md    # the §6.1 example
    client-locked-legal.md  ...     # one policy per scenario (below)
    invalid/<class>.md              # policy files for the validation tests
  expected/<policy>.<role>.json     # full CompareResult for compare(baseline, candidate)
  expected/<policy>.<role>.md       # markdown golden, for a few of them
```

- **The baseline** has one page per kind of thing we need to change: a content page (text, a `jay-policy` element), a page with two `<jay:card>` regions marked `pricing-card` and `promo-card`, a legal page, a product page with `page.ts` and a contract, a template-based area (`src/components/templates/**`), shared components, `src/services`, CSS, `package.json`, project config.
- **The candidate** changes each of those pages in a different way: a text edit, a class/style edit on one card and a prop edit on the other, a change in the legal page, a `page.ts` edit, a new page created from a template (with a content delta), a new page with no template, a deleted page, a renamed page, a CSS edit, a dependency edit, a config edit, a changed `jay-policy` marker, an edit to `jay-policy.md`, and one formatting-only change (must yield no change).
- **Policies rotate over the same pair.** Each test is `compare(baseline, candidate)` with one policy and one role, asserted against `expected/<policy>.<role>.json`. Policies are small and each targets one question:
  - the §6.1 example under developer, designer and client (the main matrix);
  - a locked policy (`edit: no`, `onViolation: block`) on one page;
  - per-instance permissions on the two cards;
  - specificity and negative rules (path vs glob vs `#name`);
  - fail-closed (a role with almost nothing set);
  - `design: designSystemOnly` vs `no` vs `yes`;
  - templates on and off, and `create: from-template` vs `yes`;
  - `publish: direct` vs `review`, `onViolation: review` vs `block`;
  - `defaultRole`, unknown role, and the reserved `admin`.
- Because the candidate is fixed, the same change is judged differently by each policy, so one `expected` file per policy shows which rule decided which change. A few cases also keep a markdown golden to pin the report format.
- **Baseline authority:** one policy-rotation case uses a candidate that also loosens `jay-policy.md`; its expected result is unchanged apart from the `policy` finding.
- **Live example:** a policy plus a small branch overlay on `examples/jay-stack/design-system-demo`, run as part of P2, so real regions and `template=` provenance are exercised.

### 9.2 Unit tests (where they fit better)

- **Policy file validation:** one `policies/invalid/<class>.md` per failure class in §6.2, plus a valid one; expected findings `toEqual`. A meta-test fails if a class in the validator has no case.
- **Selector matching and specificity:** a table fixture of `{selector, path, name, matches, specificity}` rows and ordering rows.
- **Change classifier:** per kind (content, design, css, code, dependency vs config, create, delete, rename, policy, formatting-only, region prop, `jay-content` slot, `override`, `sync`) on small in-memory trees.
- **Resolution functions:** most specific wins, equal specificity stricter, unset rule denied, strictest `onViolation`.
- **Markdown renderer:** goldens for PUBLISH, REVIEW, BLOCK, and zero changes; JSON and markdown render from the same result.
- **CLI:** exit codes 0/10/11/1; a spawned run with no `node_modules`, a stubbed network, and an empty `PATH` (no `git`) gives the normal result; output is byte-identical across runs.
- **Invariants:** `compare(X, X)` is PUBLISH for every role; making a rule value stricter never lowers a disposition.

### 9.3 Integration and phases

`jay-stack validate` on a fixture project reports the invalid-policy findings with `source: plugin:editing-policy/policy-file`, and is skipped under `--compile-only` (DL#232). P0: policy validation and selector units. P1: classifier. P2: the policy-rotation end-to-end tests, renderer, CLI, invariants, live example. P4: hook integration.

## 10. Verification criteria

1. Each fixture pair yields exactly the expected `CompareResult` JSON (`toEqual`; no `toContain` on code files).
2. Candidate that edits `jay-policy.md` to grant itself more rights: evaluated against baseline policy, finding on the policy change.
3. Markdown report and `--json` carry the same disposition, findings and changes (one renders from the other).
4. Exit codes 0/10/11/1 match dispositions and tool errors.
5. `compare` runs on two directories with no `node_modules` and no network.
6. `jay-stack validate` catches every failure class in §6.2 with an agent-actionable `suggestion`.

## 11. Trade-offs

- Pure engine means the caller does install/validate and passes the result in: slightly more wiring, in exchange for running safely before untrusted scripts.
- Public format becomes a public API: acceptable at this stage (no backward-compatibility obligation).
- A standalone `bin` (not a DL#142 plugin command) is the primary and only entry for `compare`: ✅ verified the plugin-command path carries heavyweight Vite/compiler/service initialization and cannot emit granular exit codes (§6.3, §12). Cost: `editing-policy` grows its own CLI surface instead of riding `jay-stack run`.

## 12. Implementation Readiness (verified 2026-11-08)

Every load-bearing dependency was traced to real code. Anchors are for the implementer; the four ⚠️ rows are the only net-new / cross-package work beyond this package.

| Dependency | Status | Anchor / action |
| --- | --- | --- |
| Plugin package conventions (scope, two-entry DL#179, `vite build --ssr` + `tsup`, `files` incl. `agent-kit`) | ✅ | mirror `packages/plugins/a11y-validator` (package.json, vite.config.ts, tsconfig.json, lib/index.ts + lib/tools.ts) |
| `validators`/`projectValidators` manifest shape, `Finding`+`suggestion` type | ✅ | `compiler-shared/lib/plugin-validators.ts` (`JayHtmlValidationFinding`); schema `validate-plugin.ts:548` |
| `--compile-only` skips project validators | ✅ | `validate.ts:2344` early-return precedes the validator pass at `:2574` |
| Attribute stripping / prop-vs-directive for `jay-policy` | ✅ | 3 spots: `jay-html-compiler-shared.ts:120`, `jay-html-compiler.ts:433`, `override.ts:38` (React target out of scope) |
| Region facet differ + `jay-content` slots (DL#196/#202) | ✅ | `@jay-framework/compiler-inline-composition`: `diffBodies`/`diffCss`/`isContentSlot`/`parseContent` (not `checkRegionDrift`, which is private) |
| `template=` / `as=` provenance (DL#196/#205) | ✅ | `JayHeadlessImports.template`/`contractName` (`jay-html-source-file.ts:25`, parser `:659`/`:803`) |
| `agent-kit` guideline delivery | ✅ | directory-scan convention: `agent-kit/<role>/*.md` (`run-agent-kit.ts`); no plugin.yaml key |
| `projectValidators` hook itself | ⚠️ | **does not exist** — owned by DL#232; **DL#232 P0 is a prerequisite** (§6.5) |
| `compare` as `jay-stack run` command | ⚠️ | **unworkable** (heavy init; exit 0/1 only) → standalone `bin` instead (§6.3) |
| DL#151 `token-matcher` reuse for CSS classification | ⚠️ | primitives exist but **not exported** from `design-system-validator/tools` — P1 adds the export or vendors them |
| File-tree diff / rename detection | ⚠️ | **no utility exists** — net-new engine code (P1) |

**Confirmed open decisions:** (1) `compare` ships as a standalone `bin`; (2) the `projectValidators` hook is DL#232's — #232 P0 lands first; (3) a re-flatten to current template is `sync`, allowed for every role (Q10).
