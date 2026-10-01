# Jay Stack Developer — Agent Kit

This folder contains guides for building jay-stack projects: project configuration, routing, page components, and wiring plugins together.

## What Does the Developer Role Do?

The developer sets up the project, configures plugins, creates page-level components (`page.ts`), defines page contracts (`page.jay-contract`), authors shared full-stack components (headless) for reusable UI sections like headers and footers, and wires everything together. This is distinct from the designer role (creates jay-html UI) and the plugin role (creates reusable headless components).

**Shared components are headless** — logic (`makeJayStackComponent`) + a `.jay-contract`, placed in `src/components/<name>/`. **Prefer shipping each with a `.jay-html` template** (one or more) so pages flatten it as a design-system element (`template=` + `jay-stack sync`) instead of hand-writing the UI. See [design-system-guide.md](../designer/design-system-guide.md) for the model and [component-structure.md](../plugin/component-structure.md) for the builder API.

## Workflow

1. **Set up the project** — `jay-stack setup` to configure plugins
2. **Define routes** — create page directories under `src/pages/`
3. **Create page contracts** — `page.jay-contract` for page-level data
4. **Create page components** — `page.ts` with `makeJayStackComponent`
5. **Author shared components** (when UI repeats across pages) — headless `makeJayStackComponent` + `.jay-contract` in `src/components/`, preferably shipping a `.jay-html` template for pages to flatten
6. **Configure services** — `src/init.ts` for project-level services
7. **Validate** — `jay-stack validate`
8. **Test** — `jay-stack dev --test-mode`

## Guides

| File                                              | Topic                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| [project-structure.md](project-structure.md)      | Directory layout, configuration files                                |
| [routing.md](routing.md)                          | Directory-based routing, dynamic routes                              |
| [configuration.md](configuration.md)              | .jay file, plugin config, init.ts                                    |
| [page-contracts.md](page-contracts.md)            | Page-level contracts (page.jay-contract)                             |
| [Contract Authoring Guide](../contracts/GUIDE.md) | Writing contracts: syntax, page/component/linked contracts, examples |
| [page-components.md](page-components.md)          | page.ts: makeJayStackComponent for pages                             |
| [design-system-guide.md](../designer/design-system-guide.md) | Shared components as design-system elements: ship a template, flatten, drift, `sync` |
| [component-structure.md](../plugin/component-structure.md) | Builder API for shared/headless components: `.withProps()`, phases, render results |
| [component-state.md](component-state.md)          | createSignal, createMemo, createEffect, createDerivedArray           |
| [component-refs.md](component-refs.md)            | Refs, collection refs, element types                                 |
| [component-data.md](component-data.md)            | Immutable data, JSON Patch, patching                                 |
| [render-results.md](render-results.md)            | phaseOutput, RenderPipeline, errors, redirects                       |
| [seo-guide.md](seo-guide.md)                      | SEO head tags: title, meta, OG, canonical via phaseOutput            |
| [cli-commands.md](cli-commands.md)                | CLI commands: setup, validate, dev, agent-kit                        |
| `../references/<plugin>/`                         | Plugin reference data                                                |
