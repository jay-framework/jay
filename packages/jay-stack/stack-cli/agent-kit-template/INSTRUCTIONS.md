# Jay Stack Agent Kit

This agent kit provides role-specific guides for building a Jay Stack application. Each role covers a different aspect of the project.

## Roles

### Designer (`designer/`)

Creates `.jay-html` pages and templates. Binds to contract data using template syntax — data bindings, conditions, loops, and refs. Styles pages with CSS.

**Use when:** building or modifying the visual UI of pages and components.

### Developer (`developer/`)

Creates page components (`page.ts`) using `makeJayStackComponent`, defines page contracts (`page.jay-contract`), configures routing, and sets up project services. Also creates headfull components for shared UI sections (headers, footers).

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
