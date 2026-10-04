# DL#204 — A design-system (region/template) index in the agent-kit

Status: **DESIGN — ready for review.** Promoted from DL#201 Item 4. Covers a new agent-kit index that
catalogs, for every headless component an agent could flatten, its contract and the `.jay-html`
template variants it ships. Nothing here is implemented yet.

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
- **Template-variant enumeration rule (new):** for contract `X.jay-contract` in directory `D`, a
  template is any `D/X.jay-html` or `D/X.<variant>.jay-html` (filename == contract basename, or
  basename + `.` + variant). This _tightens_ DL#200's boolean `hasTemplateForContractFile`
  (`validate.ts:104-116`), which today counts **any** `.jay-html` in `D`. Generalize that helper
  into a `listTemplatesForContractFile(contractFile): TemplateVariant[]` and have the boolean rule
  delegate to `list.length > 0` so the two never disagree.
- **Each template entry is `{ path, variant, title?, description? }`.** `title` comes from the
  template's `headMeta.title` (`jay-html-parser.ts:985`, exposed as
  `JayHtmlSourceFile.headMeta.title: TemplatePart[]`) — reconstruct text from the **static** parts;
  if empty or interpolation-only, fall back to the contract's `description`. `variant` is the
  filename suffix (`''`/`default` for the name-matched base template).
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

**Q: Can one contract have multiple templates? How are they named?**
A: Yes — co-location allows any number of `.jay-html` beside a `.jay-contract`
(`hasTemplateForContractFile` uses `.some(...)`). There is no naming scheme in code today. This DL
_defines_ one: `X.jay-html` (base) and `X.<variant>.jay-html` (variants), keyed to the contract
basename. This disambiguates directories that hold more than one contract and gives each variant a
stable `variant` id. (DL#200's looser "any `.jay-html` in dir" boolean becomes `list.length > 0`
over this stricter enumeration — a behavior change only in the pathological multi-contract-dir case,
which we should also flag in `validate`.)

**Q: What is a template's description?**
A: Its `<title>` (`headMeta.title`), reconstructed from static `TemplatePart`s; fall back to the
contract `description` when the title is empty/interpolation-only. (DL#201 Item 4 tentative design.)

**Q: Should this index affect the build, or just inform agents?**
A: Inform agents, plus one validator improvement: `REGION-NOT-LINKED`'s suggestion names the real
path(s). No build gating — consistent with DL#200 (warnings never block).

## Design

### New types (`contract-materializer.ts`, beside the existing index types)

```ts
export interface TemplateVariant {
  path: string; // repo-relative or agent-kit-relative path to the .jay-html
  variant: string; // '' | 'default' for the base, else the filename suffix (e.g. 'feature', 'compact')
  title?: string; // from headMeta.title static parts
  description?: string; // title ?? contract.description
}

export interface DesignSystemComponentEntry {
  name: string; // contract name
  contractPath: string; // path to the .jay-contract
  source: 'local' | 'plugin';
  plugin?: string; // plugin name when source === 'plugin'
  templates: TemplateVariant[];
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
export function listTemplatesForContractFile(contractFile: string | undefined): TemplateVariant[] {
  if (!contractFile) return [];
  const dir = path.dirname(contractFile);
  const base = path.basename(contractFile, JAY_CONTRACT_EXTENSION); // e.g. 'card'
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter(
      (f) =>
        f === `${base}${JAY_EXTENSION}` || (f.startsWith(`${base}.`) && f.endsWith(JAY_EXTENSION)),
    )
    .map((f) => toTemplateVariant(path.join(dir, f), base));
}
export function hasTemplateForContractFile(c: string | undefined): boolean {
  return listTemplatesForContractFile(c).length > 0;
}
```

`toTemplateVariant` parses the `.jay-html` (reuse the existing jay-html parse) to read
`headMeta.title`, derives `variant` from the filename (`'' ` when `f === base.jay-html`, else the
middle segment).

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
```

(`agentKitDir = path.dirname(outputDir)`, already computed at `:625`.)

### DL#200 suggestion upgrade (`validate.ts`)

`REGION-NOT-LINKED`'s suggestion builds its path from `listTemplatesForContractFile(imp.contractPath)`:
one variant → name it exactly; multiple → list them so the author picks. Placeholder only when the
list is somehow empty (shouldn't happen, since the rule only fires when a template exists).

## Implementation Plan

1. **Types** — add `TemplateVariant`, `DesignSystemComponentEntry`, `DesignSystemIndex`, and
   `PluginsIndex.designSystemIndex` in `contract-materializer.ts`.
2. **Lookup** — generalize `hasTemplateForContractFile` → `listTemplatesForContractFile` in
   `validate.ts`; keep the boolean as a wrapper; add `toTemplateVariant` (reads `headMeta.title`).
3. **Generation** — in `materializeContracts`, after the plugins-index write: local scan over
   `componentsBase` + plugin scan over `scannedPlugins`; emit `design-system-index.yaml`; set the
   `designSystemIndex` link on the plugins-index object before it serializes.
4. **CLI print** — `run-agent-kit.ts`: when printing the index (`:118-128`), also surface the new
   index (and a `--design-system` list mode mirroring `--list`, optional).
5. **DL#200 suggestion** — rewrite `REGION-NOT-LINKED`'s suggestion to name real paths.
6. **Docs** — add a pointer in `agent-kit-template/designer/contracts-and-plugins.md` ("read
   `design-system-index.yaml` to choose a template to flatten").
7. **Tests** (fixture-based, `toEqual` on parsed YAML — never `toContain`): a fixture project with
   (a) a local component that ships two variants (`card.jay-html` + `card.feature.jay-html`), (b) a
   local component with no template (empty `templates`), (c) a plugin contract with a template.
   Assert the emitted `design-system-index.yaml` object and the `designSystemIndex` link.

## Examples

`agent-kit/design-system-index.yaml`:

```yaml
components:
  - name: card
    contractPath: ./src/components/card/card.jay-contract
    source: local
    templates:
      - path: ./src/components/card/card.jay-html
        variant: ''
        title: Card
        description: Card
      - path: ./src/components/card/card.feature.jay-html
        variant: feature
        title: Feature card
        description: Feature card
  - name: badge
    contractPath: ./src/components/badge/badge.jay-contract
    source: local
    templates: [] # COMPONENT-NO-TEMPLATE also fires (DL#200)
  - name: rating
    contractPath: ./node_modules/@acme/reviews/rating.jay-contract
    source: plugin
    plugin: '@acme/reviews'
    templates:
      - path: ./node_modules/@acme/reviews/rating.jay-html
        variant: ''
        title: Star rating
```

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
- **A stricter template-naming rule.** `X.jay-html` / `X.<variant>.jay-html` is new convention. It
  tightens DL#200's "any `.jay-html` in the dir" — a behavior change only when a directory holds
  multiple contracts (already an unusual layout). Worth a companion `validate` note so a stray
  `.jay-html` that matches no contract basename is reported rather than silently ignored.
- **Parse cost at agent-kit time.** We now parse every candidate `.jay-html` to read its `<title>`.
  Agent-kit generation is a dev/build-time step, not a hot path; acceptable.

## Verification criteria

1. A project with local components (some multi-variant, some template-less) and a plugin component
   emits a `design-system-index.yaml` whose object equals the fixture (`toEqual`).
2. `plugins-index.yaml` carries `designSystemIndex: ./design-system-index.yaml`.
3. `hasTemplateForContractFile` still returns the same boolean for existing DL#200 tests (wrapper
   over the new enumeration) — no regression in `COMPONENT-NO-TEMPLATE` / `REGION-NOT-LINKED`.
4. `REGION-NOT-LINKED`'s suggestion names the real template path(s) for a contract with a sibling
   template.
