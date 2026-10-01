# Jay Stack Agent Kit

This agent kit provides role-specific guides for building a Jay Stack application. Each role covers a different aspect of the project.

## Component model: Jay Stack is headless-only

Jay has two component models, and **Jay Stack uses only one of them — headless.**

- **Headless — the Jay Stack model.** Logic + a `.jay-contract`, with **no bound template of its own**. The
  consuming page (or component) provides the UI by flattening the component's template into a `<jay:X>`
  region. Authored with `makeJayStackComponent` (full-stack: slow/fast/interactive) or provided by a plugin.
  Imported with `<script type="application/jay-headless" contract="…" [src="…"] [template="…"]>`. This is the
  only component model a Jay Stack page composes.
- **Headfull — the lower-level Jay model.** Logic bundled with its **own** template via `makeJayComponent`.
  Imported with `<script type="application/jay-headfull" src="…" names="…">` (**no** `contract=`). It has **no
  server rendering**, so it is **never used directly in a Jay Stack page** — use it only in standalone,
  client-only Jay apps. A `jay-headfull` import carrying a `contract=` is a hard build error (DL#196).

Throughout this kit, "component" means a headless component unless it explicitly says otherwise.

**Prefer a design system.** When UI is reused — or could be — compose it from headless components that ship
`.jay-html` templates (a _design system_) and **flatten** those templates into your pages as design-system
elements (`template=` + `jay-stack sync`), rather than hand-writing each `<jay:X>` region's markup. Flattened
regions stay consistent across pages and upgrade in one step via `sync`, while `validate` tracks any
per-page edits you choose to keep. Hand-author a region's body only when no template is shipped for it. See
[designer/design-system-guide.md](designer/design-system-guide.md).

## Roles

### Designer (`designer/`)

Creates `.jay-html` pages and templates. Binds to contract data using template syntax — data bindings, conditions, loops, and refs. Styles pages with CSS.

**Use when:** building or modifying the visual UI of pages and components.

### Developer (`developer/`)

Creates page components (`page.ts`) using `makeJayStackComponent`, defines page contracts (`page.jay-contract`), configures routing, and sets up project services. Also creates shared full-stack components (headless) for reusable UI sections (headers, footers).

**Use when:** adding page logic, defining data shapes, configuring the project, or creating shared components.

### Plugin (`plugin/`)

Creates reusable headless components packaged as plugins. Defines contracts, actions, services, and CLI commands that other projects consume.

**Use when:** building a reusable plugin that will be installed by other projects.

### DevOps (`devops/`)

Handles production builds, deployment configuration, serving modes, and cache invalidation.

**Use when:** deploying the application or configuring production infrastructure.

## Shared Guides

### Contracts (`contracts/`)

Contract authoring guide shared across all roles. Covers syntax, page contracts, component contracts, linked contracts, and graduated examples.

**Start here:** [contracts/GUIDE.md](contracts/GUIDE.md) — decision tree for what kind of contract to write.
