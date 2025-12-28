# @jay-framework/view-state-merge

Deep merge utility for combining ViewStates with identity-based array merging.

## Purpose

This library provides a deep merge algorithm that correctly combines ViewStates from different rendering phases or interactive updates. Unlike simple object spread (`{...a, ...b}`), this algorithm:

1. **Deep merges nested objects** - Preserves properties from both sources at any nesting depth
2. **Merges arrays by identity** - Uses `trackBy` metadata to match array items by their identity field (e.g., `id`) and merge their properties
3. **Base defines structure** - For tracked arrays, items only in overlay are NOT added; the base array defines which items exist
4. **Array replacement without trackBy** - Arrays without trackBy info are completely replaced by overlay, enabling dynamic list updates (search results, filters, etc.)

## Usage

```typescript
import { deepMergeViewStates, TrackByMap } from '@jay-framework/view-state-merge';

const base = {
  name: 'Product',
  items: [
    { id: '1', title: 'Item 1' },
    { id: '2', title: 'Item 2' },
  ],
};

const overlay = {
  price: 29.99,
  items: [
    { id: '1', selected: true },
    { id: '2', selected: false },
  ],
};

const trackByMap: TrackByMap = {
  items: 'id', // 'items' array uses 'id' field for identity
};

const merged = deepMergeViewStates(base, overlay, trackByMap);
// Result:
// {
//     name: 'Product',
//     price: 29.99,
//     items: [
//         { id: '1', title: 'Item 1', selected: true },
//         { id: '2', title: 'Item 2', selected: false },
//     ],
// }
```

## API

### `deepMergeViewStates(base, overlay, trackByMap, path?)`

Merges two ViewState objects, with overlay values taking precedence for conflicts.

- `base` - Base ViewState object
- `overlay` - Overlay ViewState object (values override base)
- `trackByMap` - Map from property paths to trackBy field names
- `path` - (internal) Current property path for recursion

### `TrackByMap`

Type alias for the trackBy mapping:

```typescript
type TrackByMap = Record<string, string>;
```

Keys are dot-separated property paths (e.g., `"items"`, `"user.orders"`), values are the field names used for identity (e.g., `"id"`, `"orderId"`).

## Array Behavior

### With trackBy (identity-based merge)

When an array path is in `trackByMap`, items are matched by identity and merged:

```typescript
const trackByMap = { items: 'id' };

// Base: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
// Overlay: [{ id: '1', selected: true }]
// Result: [{ id: '1', name: 'A', selected: true }, { id: '2', name: 'B' }]
```

- Items are matched by their `id` field
- Properties from both are merged
- Base array order is preserved
- Overlay-only items are NOT added (base defines structure)

### Without trackBy (full replacement)

When an array path is NOT in `trackByMap`, the overlay array completely replaces the base:

```typescript
const trackByMap = {}; // No trackBy for searchResults

// Base: [{ id: '1', title: 'Old' }]
// Overlay: [{ id: '3', title: 'New 1' }, { id: '4', title: 'New 2' }]
// Result: [{ id: '3', title: 'New 1' }, { id: '4', title: 'New 2' }]
```

This is useful for:

- Search results that change entirely
- Filtered lists
- Paginated data
- Any dynamic list where items aren't being updated, but replaced

## See Also

- Design Log #56: Deep Merge View States with Track-By
- Design Log #62: Relocate Deep Merge for Stack-Client-Runtime
