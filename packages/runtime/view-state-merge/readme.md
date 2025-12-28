# @jay-framework/view-state-merge

Deep merge utility for combining ViewStates with identity-based array merging.

## Purpose

This library provides a deep merge algorithm that correctly combines ViewStates from different rendering phases or interactive updates. Unlike simple object spread (`{...a, ...b}`), this algorithm:

1. **Deep merges nested objects** - Preserves properties from both sources at any nesting depth
2. **Merges arrays by identity** - Uses `trackBy` metadata to match array items by their identity field (e.g., `id`) and merge their properties

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

## See Also

- Design Log #56: Deep Merge View States with Track-By
- Design Log #62: Relocate Deep Merge for Stack-Client-Runtime

