# DL#204 — A design-system (region/template) index in the agent-kit

Status: **DESIGN — ready for review (rev. 2, review feedback folded in).** Promoted from DL#201
Item 4. Covers a new agent-kit index — plus a human/agent-readable "add-menu" doc — that catalogs,
for every headless component an agent could flatten, its contract and the `.jay-html` template
variants it ships. Template↔contract association is by the template's declared contract reference, not
a filename convention. Nothing here is implemented yet.

Related: #85 (plugins-index / agent kit), #196 (flatten / regions / `template=`), #200 (prefer
design-system elements — `REGION-NOT-LINKED`, `COMPONENT-NO-TEMPLATE`, availability heuristic),
#201 (region system follow-ups — this is Item 4).

---

## Decisions for the Implementer (TL;DR)

- **Emit a new sibling index `agent-kit/design-system-index.yaml`**, written right after
  `plugins-index.yaml` in `materializeContracts` (mirror the write at
  `contract-materializer.ts:625-629`). Do **not** overload `plugins-index`'s per-contract entries —
  the new index has a different discovery scope (it must cover local `src/components`, which
  plugins-index does not scan).
- **Link it from `plugins-index.yaml`** with a single top-level pointer field
  `designSystemIndex: ./design-system-index.yaml`, and add a pointer in the designer agent-kit docs
  (`agent-kit-template/designer/contracts-and-plugins.md`). The YAML link is the machine edge; the
  doc pointer is the human/agent edge.
- **Two discovery sources, merged into one catalog:**
  1. **Local components** — scan `componentsBase` (default `./src/components`, same base `validate`
     uses) for `*.jay-contract`, enumerate sibling template variants.
  2. **Plugin components** — reuse `scanPlugins({ projectRoot, includeDevDeps: true })`
     (`plugin-scanner.ts`); for each `manifest.contracts` / `dynamic_contracts` entry, enumerate
     sibling template variants next to the contract path.
- **Template-variant enumeration rule:** a template is a variant of contract `X.jay-contract` when
  its own `<script type="application/jay-data" contract="…">` resolves to that same `.jay-contract`
  file. No filename convention — the template already _declares_ its contract (`contractRef`,
  `jay-html-parser.ts:545-546`), so we match on that, not on the filename. This also handles a
  directory holding several contracts correctly: each `.jay-html` is grouped under whichever contract
  it points at. Generalize DL#200's boolean `hasTemplateForContractFile` (`validate.ts:104-116`,
  which today counts **any** `.jay-html` in the dir) into
  `listTemplatesForContractFile(contractFile): TemplateVariant[]` that scans the dir, parses each
  `.jay-html`, and keeps the ones whose resolved `contractRef === contractFile`; the boolean rule
  delegates to `list.length > 0`.
- **Each template entry is `{ path, variant, title? }`.** `title` comes from the template's
  `headMeta.title` (`jay-html-parser.ts:985`, exposed as
  `JayHtmlSourceFile.headMeta.title: TemplatePart[]`) — reconstruct text from the **static** parts;
  if empty or interpolation-only, omit it. **No fallback to the contract description** — that is a
  property of the component, not of a specific template (see next bullet). `variant` is a stable id
  derived from the filename stem (`''`/`default` for `X.jay-html`, else the stem, e.g. `card.feature`).
- **The contract `description` lives on the _component_ entry, not the template.** A
  `DesignSystemComponentEntry` carries `description?` read from the `.jay-contract`; template entries
  carry only their own `<title>`. One contract → one description; N templates → N titles.
- **Also emit an agent/editor "add-menu" doc** (`agent-kit/design-system.md`) generated from the
  same scan: a human- and agent-readable catalog of every component and its template variants, each
  with the ready-to-paste `template=` import + `<jay:X>` snippet. The YAML index is the machine edge;
  this doc is the "what can I add here" menu an editor UI or an agent reads.
- **Feed DL#200's `REGION-NOT-LINKED` suggestion** with the real template path(s) from this index
  instead of the current `"…/card.jay-html"` placeholder (`validate.ts` suggestion string).
- **Non-goal:** no new runtime, no new `.jay-html`/contract syntax. This is a build-time catalog
  generated from files that already exist. If a contract ships no template, it simply has an empty
  `templates: []` (and DL#200 already warns `COMPONENT-NO-TEMPLATE`).

---

## Background

An agent (or human) authoring a page chooses which `<jay:X>` regions to flatten. DL#196 made
`template=` the provenance marker and DL#200 added warnings that _nudge_ toward design-system
elements (`REGION-NOT-LINKED` when a region could be linked; `COMPONENT-NO-TEMPLATE` when a
component ships no template). But nothing hands the agent a **catalog**: which components ship
templates, how many variants each has, and what each variant is _for_.

The agent-kit already generates `plugins-index.yaml` (DL#85) via `materializeContracts`
(`contract-materializer.ts:340`, written at `:611-629`). It lists plugin contracts, actions,
services, routes — but **no templates**, and (critically) it only sees _plugins_.

## Problem

Three concrete gaps:

1. **No template catalog.** `PluginContractEntry` (`contract-materializer.ts:38-45`) has
   `name/description/type/path/metadata` — no `templates` field. An agent can't discover that
   `card` ships `card.jay-html` _and_ `card.feature.jay-html`, nor what distinguishes them.
2. **Local components are invisible.** `scanPlugins` (`plugin-scanner.ts:61-188`) discovers only
   `src/plugins/*` (with `plugin.yaml`) and node_modules deps (with `plugin.yaml`). A plain project
   component under `src/components/card/` is **never** indexed — yet it is exactly what DL#200's
   availability heuristic finds and what a page most often flattens.
3. **`REGION-NOT-LINKED` can't name the path.** DL#200's suggestion emits a placeholder
   (`template="…/card.jay-html"`) because it only knows a template _exists_ (boolean
   `hasTemplateForContractFile`, `validate.ts:104-116`), not _where_ or _which variant_.

## Prior Art / Adjacent Mechanisms

| Mechanism                          | Where                                                                                                                   | Solves / Constrains                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins-index.yaml` generation    | `contract-materializer.ts:340-629`; CLI `run-agent-kit.ts:80-128,348-364`                                               | The index-emission pattern to mirror; but scope is plugins-only and schema has no templates.                                                      |
| `scanPlugins`                      | `plugin-scanner.ts:61-188`                                                                                              | Gives us plugin + local-plugin contracts. Does **not** scan `src/components` — so we add a local-component scan.                                  |
| `hasTemplateForContractFile`       | `validate.ts:104-116`                                                                                                   | Already does directory-co-location template lookup, but collapses to a boolean. Generalize to an enumeration; keep the boolean as a thin wrapper. |
| `parseHeadMeta` → `headMeta.title` | `jay-html-parser.ts:985-991`, `:1320,:1364`; type at `plugin-validators.ts:11-23`; exposed `jay-html-source-file.ts:75` | The per-template description source. Already parsed into the pipeline — we just read it.                                                          |
| `componentsBase` config            | same base `validate`/`sync` scope to (default `./src/components`)                                                       | The local-component discovery root — reuse it so the index and the validators agree on what a "project component" is.                             |

**Null hypothesis (why not reuse what exists):** Could we just add `templates` to
`PluginContractEntry` and be done? No — that only covers plugin contracts, leaving local
`src/components` (the common case) uncatalogued. The new index needs an independent local scan, so a
separate index with its own discovery is the smaller, more honest surface than stretching
plugins-index to mean two different scopes.

## Questions and Answers

**Q: New sibling index, or new fields on plugins-index?**
A: Sibling index (`design-system-index.yaml`). Decided by the user ("a second index file that is
linked from plugin-index"), and justified by scope: plugins-index is plugins-only; the design-system
index must also cover local components. Keeping them separate keeps each index's scope coherent.

**Q: Does plugins-index already list same-project components?**
A: No — only plugins (`src/plugins/*` + node_modules, both gated on `plugin.yaml`). Confirmed in
`plugin-scanner.ts:82-188`. This is why the new index can't just reference plugins-index entries.

**Q: Can one contract have multiple templates? How are they associated — by filename?**
A: Yes, co-location allows any number of `.jay-html` beside a `.jay-contract`. **No filename
convention is needed** (reviewer: "why not just count any template variant that shares the same
contract?"). Each `.jay-html` already declares its contract via
`<script type="application/jay-data" contract="…">` (`contractRef`, `jay-html-parser.ts:545-546`); a
template is a variant of contract `X` iff its resolved `contractRef` points at `X.jay-contract`.
That is both simpler (no new naming rule to teach) and more correct in a multi-contract directory
(each template is grouped by what it actually points at, not by a basename coincidence). DL#200's
"any `.jay-html` in dir" boolean becomes `listTemplatesForContractFile(...).length > 0` over this
contract-reference match. The `variant` id is just the filename stem, for a stable handle — it is a
label, not the association key.

**Q: What is a template's description?**
A: Its `<title>` (`headMeta.title`), reconstructed from static `TemplatePart`s; omit it when the
title is empty/interpolation-only. **It does _not_ fall back to the contract `description`**
(reviewer: the contract description "belongs at the contract level, not the specific template"). The
contract description is a property of the _component_, so it lives on `DesignSystemComponentEntry`
(read once from the `.jay-contract`), while each template entry carries only its own `<title>`.

**Q: Only a YAML index, or a human/agent-facing doc too?**
A: Both. Since we already have the scan, also generate an "add-menu" markdown doc
(`agent-kit/design-system.md`) — a catalog of every component and its template variants with a
copy-paste import + `<jay:X>` snippet. This is the menu an editor UI's "add element" panel or an
agent reads to decide what to flatten; the YAML stays the structured/machine form. (Reviewer: "if we
create the index, we can as well create an editor/add-menu doc as well.")

**Q: Should this index affect the build, or just inform agents?**
A: Inform agents, plus one validator improvement: `REGION-NOT-LINKED`'s suggestion names the real
path(s). No build gating — consistent with DL#200 (warnings never block).

## Design

### New types (`contract-materializer.ts`, beside the existing index types)

```ts
export interface TemplateVariant {
  path: string; // repo-relative or agent-kit-relative path to the .jay-html
  variant: string; // '' | 'default' for X.jay-html, else the filename stem — a stable label, not the association key
  title?: string; // from headMeta.title static parts; omitted when empty/interpolation-only
}

export interface DesignSystemComponentEntry {
  name: string; // contract name
  contractPath: string; // path to the .jay-contract
  description?: string; // from the .jay-contract — a component-level property, read once
  source: 'local' | 'plugin';
  plugin?: string; // plugin name when source === 'plugin'
  templates: TemplateVariant[]; // every .jay-html whose contractRef resolves to this contract
}

export interface DesignSystemIndex {
  components: DesignSystemComponentEntry[];
}
```

And a one-field link on the existing index:

```ts
export interface PluginsIndex {
  plugins: PluginsIndexEntry[];
  designSystemIndex?: string; // './design-system-index.yaml'
}
```

### Generalize the template lookup (`validate.ts`)

```ts
// Replaces the boolean-only hasTemplateForContractFile; boolean becomes list.length > 0.
// Association is by the template's declared contract (contractRef), not by filename.
export function listTemplatesForContractFile(contractFile: string | undefined): TemplateVariant[] {
  if (!contractFile) return [];
  const dir = path.dirname(contractFile);
  const target = path.resolve(contractFile);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((f) => f.endsWith(JAY_EXTENSION))
    .map((f) => path.join(dir, f))
    .filter((p) => resolvedContractRef(p) === target) // parse .jay-html, resolve its contract=, compare
    .map((p) => toTemplateVariant(p));
}
export function hasTemplateForContractFile(c: string | undefined): boolean {
  return listTemplatesForContractFile(c).length > 0;
}
```

`resolvedContractRef(jayHtmlPath)` parses the `.jay-html` (reuse the existing jay-html parse), reads
the `contractRef` from its `<script type="application/jay-data" contract="…">`
(`jay-html-parser.ts:545-546`), and resolves it relative to the template's directory; returns
`undefined` for templates with inline data / no contract (those are never design-system variants).
`toTemplateVariant` reads `headMeta.title` for the `title` and derives `variant` from the filename
stem (`''` when the file is `<contract-basename>.jay-html`, else the stem) — a label only.

> **Note — we parse each candidate `.jay-html` anyway.** Both the old filename rule and this
> contract-reference rule have to parse the template to read its `<title>`. Matching on `contractRef`
> adds no parse cost over what the `title` already requires; it only removes the naming convention.

### Generation (`materializeContracts`, after the plugins-index write at `:625-629`)

```ts
const designSystem: DesignSystemIndex = { components: [] };
// local components — scan componentsBase for *.jay-contract
for (const contractFile of globContracts(componentsBase)) {
  designSystem.components.push(localEntry(contractFile)); // source: 'local'
}
// plugin components — reuse the same scan plugins-index already did
for (const plugin of scannedPlugins) {
  for (const c of [...plugin.manifest.contracts, ...plugin.manifest.dynamic_contracts]) {
    designSystem.components.push(pluginEntry(plugin, c)); // source: 'plugin'
  }
}
pluginsIndex.designSystemIndex = './design-system-index.yaml';
fs.writeFileSync(
  path.join(agentKitDir, 'design-system-index.yaml'),
  YAML.stringify(designSystem),
  'utf-8',
);
// human/agent "add-menu" doc, generated from the same object
fs.writeFileSync(
  path.join(agentKitDir, 'design-system.md'),
  renderAddMenu(designSystem),
  'utf-8',
);
```

(`agentKitDir = path.dirname(outputDir)`, already computed at `:625`.)

`localEntry`/`pluginEntry` set the component `description` by parsing the `.jay-contract` and reading
its `description` (component-level). `renderAddMenu` walks the same `DesignSystemIndex` and emits a
markdown catalog — one section per component (name + contract `description`), a row per template
variant (its `<title>` + `variant`), and a ready-to-paste snippet pairing the `template=` import with
the `<jay:X>` region.

### DL#200 suggestion upgrade (`validate.ts`)

`REGION-NOT-LINKED`'s suggestion builds its path from `listTemplatesForContractFile(imp.contractPath)`:
one variant → name it exactly; multiple → list them so the author picks. Placeholder only when the
list is somehow empty (shouldn't happen, since the rule only fires when a template exists).

## Implementation Plan

1. **Types** — add `TemplateVariant`, `DesignSystemComponentEntry`, `DesignSystemIndex`, and
   `PluginsIndex.designSystemIndex` in `contract-materializer.ts`. (`TemplateVariant` has no
   `description`; `DesignSystemComponentEntry` has `description`.)
2. **Lookup** — generalize `hasTemplateForContractFile` → `listTemplatesForContractFile` in
   `validate.ts`, matching on the template's resolved `contractRef` (not filename); keep the boolean
   as a wrapper; add `resolvedContractRef` and `toTemplateVariant` (reads `headMeta.title`, derives
   `variant` from the filename stem).
3. **Generation** — in `materializeContracts`, after the plugins-index write: local scan over
   `componentsBase` + plugin scan over `scannedPlugins`; read each contract's `description` for the
   component entry; emit `design-system-index.yaml`; set the `designSystemIndex` link on the
   plugins-index object before it serializes.
4. **Add-menu doc** — `renderAddMenu(designSystem)` → write `agent-kit/design-system.md` (component
   sections with contract `description`, per-variant rows, copy-paste import + `<jay:X>` snippet).
5. **CLI print** — `run-agent-kit.ts`: when printing the index (`:118-128`), also surface the new
   index (and a `--design-system` list mode mirroring `--list`, optional).
6. **DL#200 suggestion** — rewrite `REGION-NOT-LINKED`'s suggestion to name real paths.
7. **Docs** — add a pointer in `agent-kit-template/designer/contracts-and-plugins.md` ("read
   `design-system.md` / `design-system-index.yaml` to choose a template to flatten").
8. **Tests** (fixture-based, `toEqual` on parsed YAML — never `toContain`): a fixture project with
   (a) a local component that ships two variants both pointing at the same contract, (b) a local
   component with no template (empty `templates`), (c) a plugin contract with a template, and (d) a
   directory holding **two** contracts with one template each, to prove association is by `contractRef`
   not filename. Assert the emitted `design-system-index.yaml` object and the `designSystemIndex` link.

## Examples

`agent-kit/design-system-index.yaml`:

```yaml
components:
  - name: card
    contractPath: ./src/components/card/card.jay-contract
    description: A product card with media, title and body. # from the .jay-contract
    source: local
    templates:
      - path: ./src/components/card/card.jay-html
        variant: ''
        title: Card
      - path: ./src/components/card/card.feature.jay-html
        variant: card.feature # the filename stem
        title: Feature card
  - name: badge
    contractPath: ./src/components/badge/badge.jay-contract
    description: A small status badge.
    source: local
    templates: [] # COMPONENT-NO-TEMPLATE also fires (DL#200)
  - name: rating
    contractPath: ./node_modules/@acme/reviews/rating.jay-contract
    description: Star rating control.
    source: plugin
    plugin: '@acme/reviews'
    templates:
      - path: ./node_modules/@acme/reviews/rating.jay-html
        variant: ''
        title: Star rating
```

`agent-kit/design-system.md` (the add-menu doc, same data):

````md
# Design-system elements you can add

## card — A product card with media, title and body.

| Variant   | Title        | Template                                   |
| --------- | ------------ | ------------------------------------------ |
| (default) | Card         | ./src/components/card/card.jay-html         |
| card.feature | Feature card | ./src/components/card/card.feature.jay-html |

To add the **Feature card** variant:

```html
<script
  type="application/jay-headless"
  contract="./src/components/card/card.jay-contract"
  template="./src/components/card/card.feature.jay-html"
></script>

<jay:card ref="myCard"><!-- flattened copy; edit freely --></jay:card>
```

Then run `jay-stack sync` to flatten it.

## rating — Star rating control.

| Variant   | Title       | Template                                  |
| --------- | ----------- | ----------------------------------------- |
| (default) | Star rating | ./node_modules/@acme/reviews/rating.jay-html |
````

`plugins-index.yaml` gains one line:

```yaml
designSystemIndex: ./design-system-index.yaml
plugins:
  - name: '@acme/reviews'
    # …
```

## Trade-offs

- **Two indexes instead of one.** Slight duplication (plugin contracts appear in both), but each
  index keeps a coherent scope; merging would force plugins-index to also mean "local components,"
  which it currently doesn't.
- **No new naming convention.** Association is by the template's declared `contractRef`, which
  already exists, so there is nothing new to teach and a multi-contract directory groups correctly.
  (Earlier draft proposed an `X.jay-html` / `X.<variant>.jay-html` filename rule; dropped per review
  as unnecessary surface.) A `.jay-html` whose `contractRef` resolves to no scanned contract is
  simply uncatalogued — worth a companion `validate` note so a stray template is reported rather than
  silently ignored.
- **Parse cost at agent-kit time.** We parse every candidate `.jay-html` to read its `<title>` and
  `contractRef`. Agent-kit generation is a dev/build-time step, not a hot path; acceptable — and the
  contract-reference match adds no parse over what the title already needs.
- **A second generated artifact (the add-menu doc).** `design-system.md` duplicates the YAML's
  content in prose. It is regenerated from the same object each run, so they can't drift; the cost is
  one more file write.

## Verification criteria

1. A project with local components (some multi-variant, some template-less) and a plugin component
   emits a `design-system-index.yaml` whose object equals the fixture (`toEqual`). Each component
   entry carries its contract `description`; each template entry carries only its `<title>`.
2. A directory holding two contracts with one template each groups each template under the contract
   its `contractRef` points at (proves association is by reference, not filename).
3. `plugins-index.yaml` carries `designSystemIndex: ./design-system-index.yaml`.
4. `agent-kit/design-system.md` is emitted and lists every component + variant with a paste-ready
   import/`<jay:X>` snippet.
5. `hasTemplateForContractFile` still returns the same boolean for existing DL#200 tests (wrapper
   over the new enumeration) — no regression in `COMPONENT-NO-TEMPLATE` / `REGION-NOT-LINKED`.
6. `REGION-NOT-LINKED`'s suggestion names the real template path(s) for a contract with a sibling
   template.

## Implementation Results

Status: **implemented**. All verification criteria met. Tests: `design-system-index` 8/8,
`validate` 84/84, full `stack-cli` 127/127, full `stack-server-build` 59/59; both packages
type-check and build clean.

### What shipped

- **`packages/jay-stack/stack-server-build/lib/design-system-index.ts`** (new) — the shared
  module. Exports the `TemplateVariant` / `DesignSystemComponentEntry` / `DesignSystemIndex`
  types, plus `listTemplatesForContractFile`, `hasTemplateForContractFile`,
  `buildDesignSystemIndex`, and `renderAddMenu`. A lightweight `readTemplateMeta` reads each
  `.jay-html` with `node-html-parser` to extract `contractRef` (the `contract=` attr on
  `script[type="application/jay-data"]`, resolved absolute) and `<title>` (interpolation-only
  titles are dropped).
- **`contract-materializer.ts`** — generation wired into `materializeContracts`: builds the index,
  writes `agent-kit/design-system-index.yaml` + `agent-kit/design-system.md`, and links the YAML
  from `plugins-index.yaml` via `designSystemIndex`. `readComponentsBase` honors the `.jay`
  `devServer.componentsBase` (default `./src/components`).
- **`stack-cli/lib/validate.ts`** — `checkRegionNotLinked` now takes a
  `templatesFor: (imp) => TemplateVariant[]` and names real, project-relative template paths in its
  suggestion; the local `hasTemplateForContractFile` was removed in favor of the shared one.
- **`stack-cli/lib/run-agent-kit.ts`** + **`designer/contracts-and-plugins.md`** — summary line and
  a "Discovery: Design-System Index" doc section.

### Deviations from the design

1. **Shared lookup lives in `stack-server-build`, not `validate.ts`.** The DL placed the
   enumeration in `validate.ts`, but `stack-server-build` (which generates the index) cannot import
   from `stack-cli` — the dependency runs the other way. The functions therefore live in
   `stack-server-build`'s new module and `validate.ts` imports them.
2. **Lightweight `node-html-parser` read, not a full `parseJayFile`.** Only `contractRef` + `<title>`
   are needed, so a full parse is unnecessary; added `node-html-parser` as an explicit dependency.
3. **`variant` is the filename stem** (e.g. `card.feature`), with the base template (stem ===
   contract basename) normalized to `''`. The DL examples showed a bare `feature`; the stem form is
   unambiguous when a directory holds multiple contracts.
4. **Dynamic plugin contracts are excluded** — they are generated at runtime and ship no co-located
   template, so they can never be flattened. Only static manifest contracts are cataloged.

### Note on association semantics (intentional)

Association is strictly by **declared contract reference**: a `.jay-html` is a variant of contract X
iff its `script[type="application/jay-data"]` carries `contract="…X.jay-contract"`. This is stricter
than DL#200's old "any sibling `.jay-html`" filename rule. A headfull component whose template uses
**inline** `application/jay-data` (no `contract=` attr) — e.g. the smoke-test `inner-block` — is
correctly reported as template-less: such a template is not contract-bound and cannot be flattened
into a `<jay:X>` region. This is the desired behavior for the index, and consistent with
`REGION-NOT-LINKED` / `COMPONENT-NO-TEMPLATE`, which concern flattenable contract-referencing
templates.
