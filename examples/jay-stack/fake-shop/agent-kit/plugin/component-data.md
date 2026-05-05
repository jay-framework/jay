# Immutable Data and Patching

In Jay, ViewState data is immutable. Never mutate objects directly — use signals and JSON Patch for updates.

## Immutable Data Model

ViewState objects passed to the render function are immutable snapshots. The framework compares old and new snapshots to determine what changed in the DOM.

```typescript
// WRONG — never mutate directly
viewState.items.push(newItem);
viewState.count = 5;

// RIGHT — return new values from signals
const [count, setCount] = createSignal(0);
setCount(5);

return { render: () => ({ count: count() }) };
```

## JSON Patch for Complex Updates

For objects with many fields, use `createPatchableSignal` with JSON Patch operations instead of replacing the entire object:

```typescript
import { createPatchableSignal } from '@jay-framework/component';
import { REPLACE, ADD, REMOVE } from '@jay-framework/json-patch';

const [state, setState, patchState] = createPatchableSignal({
  title: 'Product',
  price: 29.99,
  tags: ['sale', 'featured'],
  details: { color: 'red', size: 'M' },
});
```

### Patch Operations

**REPLACE** — Update an existing value:

```typescript
patchState({ op: REPLACE, path: ['price'], value: 19.99 });
patchState({ op: REPLACE, path: ['details', 'color'], value: 'blue' });
```

**ADD** — Add a new field or array item:

```typescript
patchState({ op: ADD, path: ['tags', 1], value: 'new-tag' }); // Insert at index 1
patchState({ op: ADD, path: ['details', 'weight'], value: '500g' });
```

**REMOVE** — Remove a field or array item:

```typescript
patchState({ op: REMOVE, path: ['tags', 0] }); // Remove first tag
patchState({ op: REMOVE, path: ['details', 'size'] });
```

**MOVE** — Move a value from one path to another:

```typescript
import { MOVE } from '@jay-framework/json-patch';

patchState({ op: MOVE, from: ['tags', 0], path: ['tags', 2] }); // Reorder array item
patchState({ op: MOVE, from: ['details', 'color'], path: ['primaryColor'] }); // Relocate field
```

### Multiple Patches

Apply multiple patches at once — the framework batches them into a single update:

```typescript
patchState(
  { op: REPLACE, path: ['price'], value: 19.99 },
  { op: REPLACE, path: ['details', 'color'], value: 'blue' },
);
```

### When to Use Patch vs Set

- **Simple values** (number, string, boolean): use `setSignal(newValue)`
- **Objects with few fields**: use `setSignal({ ...old, field: newValue })`
- **Complex nested objects**: use `patchState` for surgical updates
- **Arrays with identity tracking**: use `patchState` with ADD/REMOVE

## createDerivedArray (Map Hook)

Transform an array reactively with smart caching. Only remaps items that actually changed:

```typescript
import { createDerivedArray } from '@jay-framework/component';

const displayProducts = createDerivedArray(
  () => products(),
  (item, index, length) => ({
    label: `${item().name} - ${formatPrice(item().price)}`,
    position: `${index() + 1} of ${length()}`,
  }),
);
```

Key behavior:

- If an item's object identity hasn't changed, the cached mapped result is reused
- `index()` and `length()` are tracked — if you don't call them, changes to index/length won't trigger a remap
- Returns a `Getter<U[]>` — read with `displayProducts()`

See [component-state.md](component-state.md) for the full hook reference.
