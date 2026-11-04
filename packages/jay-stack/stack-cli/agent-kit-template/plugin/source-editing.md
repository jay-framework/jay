# Source Editing — Plugin Contributor Guide

**Audience:** Plugin authors (and AI agents) making a plugin's contracts **editable at the source** (DL#219).

**Related:** [actions-guide.md](actions-guide.md) (`devOnly` actions), [plugin-routes.md](plugin-routes.md)
(`devOnly` routes), and the devops **source-editing** guide (the inspector protocol the AIditor uses).

---

## Why

When a page binds content to your contract — e.g. `<h1>{productPage.productName}</h1>` — the source-editing
inspector resolves that pixel to the contract, but it can't know **how** your data is edited: which record,
what the write path is, or where an editor UI lives. Only your plugin knows. So each contract declares its
**editing story**, and `jay-stack validate` warns when one is missing.

## Declare the editing story (required for coverage)

In `plugin.yaml`, each contract declares **one** of:

```yaml
contracts:
  - name: product-page
    contract: ./product-page.jay-contract
    component: productPage
    editingGuide: ./editing/product-page.md # how an agent edits this contract's bound data
  - name: stock-badge
    contract: ./stock-badge.jay-contract
    component: stockBadge
    readonly: true # this contract's data isn't editable in place
```

- **`editingGuide`** — relative path to a markdown guide shipped by the plugin.
- **`readonly: true`** — the contract's data is derived/not editable in place (e.g. a computed badge).

`jay-stack validate` emits a `source-editing-coverage` warning for any contract that declares neither (and
checks the `editingGuide` file exists).

## What the editing guide contains

The guide is the **single entry point** an agent follows to edit content bound to your contract. It should tell
the agent what to do with the identity the inspector provides:

- The inspector's `stack` gives the **record identity** — a `forEach` frame's `itemId` (trackBy), a `region`
  frame's static `props`, plus the page's route params (`route`/`routePattern`).
- From that, instruct the agent to either:
  - **Write the source** — call a `devOnly` action that persists the change (see actions-guide.md), or
  - **Open an editor** — call a `devOnly` action that returns a URL and open it, or
  - offer **several options** and let the agent choose.

Action names are ordinary (nothing is reserved). Example mapping for a stores plugin:

| Contract         | Record key (from inspect result) | Guide instructs                           |
| ---------------- | -------------------------------- | ----------------------------------------- |
| `product-page`   | `slug` (route param)             | `getEditUrl(slug)` → fetch slug→productId |
| `product-search` | `productId` (`forEach` `itemId`) | `getEditUrl(productId)`                   |

## Discovery

An agent that resolves a bound value to your contract (a region `name`, or a page-script headless `key` —
see the designer **source-editing** guide) reads the contract's `.jay-contract` via `plugins-index.yaml`, then
its `editingGuide`:

- **Static contracts** — `editingGuide` / `readonly` in `plugin.yaml`.
- **Dynamic (generated) contracts** — `plugin.yaml` can't name each one, so the generator writes top-level
  `editingGuide: <project-root-relative path>` into each generated contract YAML, plus the record id the guide
  needs (e.g. `recordSetId`). Ship the guide in the plugin and copy it to that path in your
  `agentkit` handler (e.g. under `agent-kit/references/<plugin>/`).

Keep the guide concise and imperative — it is read by an agent at edit time. (Surfacing `editingGuide` into `agent-kit/plugins-index.yaml` alongside the
contract entry, so it's one hop from the index, is a planned enhancement.)

## Checklist

1. Add `editingGuide:` (or `readonly: true`) to each contract in `plugin.yaml`.
2. Write the guide at that path — the decision rule above: identity → write action / URL action.
3. Expose the write/URL path as a `devOnly` action (actions-guide.md).
4. Run `jay-stack validate` — resolve any `source-editing-coverage` warnings.
