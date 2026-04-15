# Jay Stack Developer — Agent Kit

This folder contains guides for building jay-stack projects: project configuration, routing, page components, and wiring plugins together.

## What Does the Developer Role Do?

The developer sets up the project, configures plugins, creates page-level components (`page.ts`), defines page contracts (`page.jay-contract`), and wires everything together. This is distinct from the designer role (creates jay-html UI) and the plugin role (creates reusable headless components).

## Workflow

1. **Set up the project** — `jay-stack setup` to configure plugins
2. **Define routes** — create page directories under `src/pages/`
3. **Create page contracts** — `page.jay-contract` for page-level data
4. **Create page components** — `page.ts` with `makeJayStackComponent`
5. **Configure services** — `src/init.ts` for project-level services
6. **Validate** — `jay-stack validate`
7. **Test** — `jay-stack dev --test-mode`

## Guides

| File                                         | Topic                                                      |
| -------------------------------------------- | ---------------------------------------------------------- |
| [project-structure.md](project-structure.md) | Directory layout, configuration files                      |
| [routing.md](routing.md)                     | Directory-based routing, dynamic routes                    |
| [configuration.md](configuration.md)         | .jay file, plugin config, init.ts                          |
| [page-contracts.md](page-contracts.md)       | Page-level contracts (page.jay-contract)                   |
| [page-components.md](page-components.md)     | page.ts: makeJayStackComponent for pages                   |
| [component-state.md](component-state.md)     | createSignal, createMemo, createEffect, createDerivedArray |
| [component-refs.md](component-refs.md)       | Refs, collection refs, element types                       |
| [component-data.md](component-data.md)       | Immutable data, JSON Patch, patching                       |
| [render-results.md](render-results.md)       | phaseOutput, RenderPipeline, errors, redirects             |
| [seo-guide.md](seo-guide.md)                 | SEO head tags: title, meta, OG, canonical via phaseOutput  |
| [cli-commands.md](cli-commands.md)           | CLI commands: setup, validate, dev, agent-kit              |
| `../references/<plugin>/`                    | Plugin reference data                                      |
