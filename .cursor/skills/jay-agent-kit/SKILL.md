---
name: jay-agent-kit
description: Main entry point for AI agents building jay-stack applications. Use when creating pages, working with headless components, or generating jay-html from contracts. Covers the full workflow from reading contracts to producing valid jay-html pages.
---

# Jay Agent Kit

This is the main entry point for building jay-stack applications. Read the relevant sub-skills as needed.

## Overview

Jay Stack is a full-stack framework where:

- **Plugins** provide headless components (data + interactions, no UI)
- **Contracts** define the data shape and interaction points of each component
- **jay-html** templates provide the UI that binds to contract data
- **Rendering phases** determine when data is available (build-time, request-time, client-side)

## Workflow

1. **Discover** what plugins and contracts are available
2. **Read contracts** to understand data shapes and phases
3. **Read references** — check `agent-kit/references/<plugin>/` for pre-generated discovery data (product catalogs, collection schemas). Faster than CLI commands.
4. **Create jay-html pages** that bind to contract data
5. **Validate** your files
6. **Test** with the dev server

## Sub-Skills

Read these as needed:

| Skill                                                              | When to Read                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [jay-html-authoring](../jay-html-authoring/SKILL.md)               | Creating or editing `.jay-html` pages, understanding routing, template syntax, headless components |
| [jay-contracts-and-plugins](../jay-contracts-and-plugins/SKILL.md) | Reading plugin.yaml, materialized contracts, contracts-index, plugins-index                        |
| [jay-cli-commands](../jay-cli-commands/SKILL.md)                   | Running `jay-stack params`, `validate`, or `action` commands                                       |
| [jay-dev-server-test](../jay-dev-server-test/SKILL.md)             | Starting dev server in test mode, smoke testing                                                    |

Also see the agent-kit generated docs (run `jay-stack agent-kit`):

- `agent-kit/project-structure.md` — Project layout, styling patterns, CSS themes, configuration |

## Quick Reference

### Rendering Phases

| Phase                | When               | Use For                                           |
| -------------------- | ------------------ | ------------------------------------------------- |
| **slow**             | Build time (SSG)   | Static content, SEO data, pre-rendered lists      |
| **fast**             | Request time (SSR) | Per-request data (prices, stock, personalization) |
| **fast+interactive** | Request + client   | Data that also updates on the client              |

There is no standalone "interactive" phase. Any tag with `type: interactive` is automatically `fast+interactive`. Tags without an explicit phase are available in all phases.

### Page File Structure

Each page lives in a directory under `src/pages/`:

```
src/pages/
├── page.jay-html          → /
├── products/
│   ├── page.jay-html      → /products
│   └── [slug]/
│       └── page.jay-html  → /products/:slug
```

Each page directory can contain:

- `page.jay-html` — template (required for rendering)
- `page.jay-contract` — page-level data contract (optional)
- `page.conf.yaml` — configuration: which headless components to use (optional, used when jay-html is missing)

### Headless Components — Two Patterns

**1. Key-based** (data merged into parent ViewState under a key):

```html
<script
  type="application/jay-headless"
  plugin="my-plugin"
  contract="my-contract"
  key="data"
></script>
<!-- Access: {data.fieldName}, ref="data.refName" -->
```

**2. Instance-based** (multiple instances with props, inline template):

```html
<script type="application/jay-headless" plugin="my-plugin" contract="my-widget"></script>
<jay:my-widget productId="123">
  <h3>{name}</h3>
  <button ref="addToCart">Add</button>
</jay:my-widget>
```

### Discovery Commands

```bash
# Run plugin setup (config templates, credential validation, reference data)
yarn jay-stack setup

# Materialize contracts and generate indexes
yarn jay-stack agent-kit

# Discover URL params for a contract (SSG routes)
yarn jay-stack params <plugin>/<contract>

# Run a plugin action (e.g., search products)
yarn jay-stack action <plugin>/<action> --input '{"query":"shoes"}'

# Validate all jay-html and contract files
yarn jay-stack validate
```

### Key Directories

| Path                                | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `src/pages/`                        | Page routes (directory-based routing)                    |
| `agent-kit/materialized-contracts/` | Generated contracts, indexes (run `jay-stack agent-kit`) |
| `agent-kit/references/<plugin>/`    | Pre-generated discovery data (run `jay-stack agent-kit`) |
| `node_modules/<plugin>/`            | Plugin packages with `plugin.yaml`                       |
