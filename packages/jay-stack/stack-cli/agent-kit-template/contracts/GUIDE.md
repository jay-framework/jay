# Contract Authoring Guide

Contracts (`.jay-contract` files) define the data shape, interaction points, and rendering phases for a component. They are the source of truth shared between the component implementation and the template.

## What Kind of Contract Do I Need?

### Page contract

A page has its own data that isn't fully provided by plugins.

- Place as `page.jay-contract` next to `page.jay-html` and `page.ts`
- Use `params` for dynamic route segments (`slug`, `category`)
- Can coexist with plugin headless contracts on the same page
- See [page-contracts.md](page-contracts.md)

### Headfull component contract

A shared UI section (header, footer, sidebar) that appears across multiple pages.

- Place in `src/components/<name>/` alongside the `.ts` and `.jay-html` files
- Use `props` for configuration passed by the parent page
- No `params` (components don't own routes)
- See [component-contracts.md](component-contracts.md)

### Plugin contract

A headless component provided by a plugin for others to consume.

- Place in the plugin's `lib/contracts/` directory
- Declared in `plugin.yaml`
- Can be static (file) or dynamic (generated at build time)
- See the plugin role guide for plugin-specific concerns

### Shared sub-contract

A reusable piece extracted from a larger contract and linked via `link:` syntax.

- Place alongside the contracts that reference it
- No `props` or `params` (data flows from the parent)
- See [linked-contracts.md](linked-contracts.md)

## Decision Checklist

| Question | If yes |
|----------|--------|
| Does the component own a URL route? | Add `params` — see [page-contracts.md](page-contracts.md) |
| Is it configured by a parent? | Add `props` — see [component-contracts.md](component-contracts.md) |
| Does it have nested repeated data? | Use `sub-contract` with `repeated: true` and `trackBy` |
| Is a sub-contract reused across multiple contracts? | Extract to a separate file, use `link:` — see [linked-contracts.md](linked-contracts.md) |
| Does data change per request? | Use `fast` or `fast+interactive` phase |
| Does data update on the client after interaction? | Use `fast+interactive` phase |
| Is the data static / known at build time? | Use `slow` phase |
| Does the user click, type, or select something? | Add `interactive` tag with the right `elementType` |

## Contract Syntax Reference

See [syntax.md](syntax.md) for the full YAML format: tag types, phases, data types, props, params, async data, and validation rules.

## Examples

Start with the simplest example that matches your use case, then add complexity as needed:

| Example | Complexity | Key patterns |
|---------|-----------|--------------|
| [mini-cart](examples/mini-cart.md) | Trivial | Variant + interactive refs |
| [cart-indicator](examples/cart-indicator.md) | Simple | Flat data, variants, phase choices |
| [category-list](examples/category-list.md) | Medium | Props, repeated sub-contracts |
| [product-card](examples/product-card.md) | Medium-complex | Linked sub-contracts, variants, multiple ref types |
| [product-page](examples/product-page.md) | Complex | Params, nested repeated sub-contracts, linked sub-contracts |
| [composing-contracts](examples/composing-contracts.md) | Pattern | How contracts link together into a hierarchy |
