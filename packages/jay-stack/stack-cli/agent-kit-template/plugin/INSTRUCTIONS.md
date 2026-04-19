# Jay Plugin Development — Agent Kit

This folder contains guides for creating jay-stack plugins: contracts, headless components, server actions, services, and plugin-provided routes.

## What is a Jay Plugin?

A plugin provides headless components (data + interactions, no UI) that project designers use via contracts. Plugins can also provide complete pages (backoffice tools, admin dashboards) via routes. Plugins can be standalone npm packages or inline within a project (see `examples/jay-stack/fake-shop`).

## Workflow

1. **Define contracts first** — the contract is the source of truth
2. **Implement components** matching the contracts
3. **Define actions** with `.jay-action` metadata
4. **Optionally add routes** — pages for admin tools and dashboards
5. **Set up `plugin.yaml`** — list contracts, actions, services, contexts, routes
6. **Validate** with `jay-stack validate-plugin`

## Guides

| File                                             | Topic                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [contracts-guide.md](contracts-guide.md)         | Contract format: tags, types, phases, props, params, sub-contracts      |
| [plugin-structure.md](plugin-structure.md)       | plugin.yaml, package layout, exports                                    |
| [component-structure.md](component-structure.md) | makeJayStackComponent, builder API, three-phase rendering               |
| [component-state.md](component-state.md)         | createSignal, createMemo, createEffect, createDerivedArray, createEvent |
| [component-refs.md](component-refs.md)           | Refs, collection refs, element types                                    |
| [component-data.md](component-data.md)           | Immutable data, JSON Patch, createPatchableSignal                       |
| [component-context.md](component-context.md)     | Context hooks: provide, reactive, global                                |
| [render-results.md](render-results.md)           | phaseOutput, RenderPipeline, errors, redirects                          |
| [actions-guide.md](actions-guide.md)             | makeJayAction, makeJayQuery, .jay-action files                          |
| [services-guide.md](services-guide.md)           | createJayService, makeJayInit                                           |
| [plugin-routes.md](plugin-routes.md)             | Plugin-provided pages: routes, jay-html templates, page components      |
| [seo-guide.md](seo-guide.md)                     | SEO head tags: title, meta, OG, canonical via phaseOutput               |
| [validation.md](validation.md)                   | jay-stack validate-plugin usage                                         |
| [dev-server-service.md](dev-server-service.md)   | Dev server service API: routes, params, freeze management       |
| `../references/<plugin>/`                        | Plugin reference data                                                   |

## Key Principles

- **Contract is the source of truth** — define it before implementing the component
- **Data is immutable** — never mutate ViewState directly, use JSON Patch
- **Phase-aware** — choose the right rendering phase for each piece of data
- **Props for configuration, params for URLs** — props are passed by parent components, params come from route segments
