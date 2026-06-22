# Linked and Composed Contracts

Contracts can reference other contract files using `link:` syntax. This lets you build reusable pieces and compose them into larger contracts.

## When to Extract a Sub-Contract

Extract a sub-contract into its own file when:

- The same data shape is used by multiple contracts (e.g., a product card used in search results and related products)
- The sub-contract is complex enough to warrant its own file for readability
- You want to share the structure between static and dynamic contracts

Keep a sub-contract inline when:

- It's only used in one place
- It's small (< 10 tags)
- Extracting it would make the parent harder to read

## Link Syntax

Reference another contract file with a relative path:

```yaml
- tag: mediaGallery
  type: sub-contract
  link: ./media-gallery # resolves to media-gallery.jay-contract in same directory
```

For cross-package references (e.g., dynamic contracts linking to static ones):

```yaml
- tag: gallery
  type: sub-contract
  link: '@my-org/my-plugin/media-gallery' # package path
```

## Composition Pattern

Build contracts from small pieces up to complex pages:

```
media.jay-contract            (trivial: url + mediaType)
   ^
media-gallery.jay-contract    (links to media, adds thumbnail navigation)
   ^
product-page.jay-contract     (links to media-gallery, adds options, pricing, etc.)
```

```
product-options.jay-contract  (reusable option/choice structure)
   ^
product-card.jay-contract     (links to product-options for quick-add)
   ^
product-search.jay-contract   (links to product-card for search results)
```

Each level adds its own tags around the linked sub-contracts. The linked contracts stay focused on their single responsibility.

## Linked Repeated Sub-Contracts

A linked sub-contract can also be repeated:

```yaml
- tag: searchResults
  type: sub-contract
  repeated: true
  trackBy: _id
  link: ./product-card
```

The linked contract must have a tag matching the `trackBy` field.

## See Also

- [composing-contracts example](examples/composing-contracts.md) — Real-world composition hierarchy from wix-stores
