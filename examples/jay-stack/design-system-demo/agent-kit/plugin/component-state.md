# Component State Hooks

All hooks are used inside the interactive phase (the `withInteractive` constructor function). They provide reactive state management for client-side behavior.

## createSignal

Creates a reactive getter/setter pair:

```typescript
import { createSignal } from '@jay-framework/component';

const [count, setCount] = createSignal(0);

// Read
count(); // 0

// Write
setCount(5); // set to 5
setCount((n) => n + 1); // increment
```

Can initialize from a getter (reactive dependency):

```typescript
const [label, setLabel] = createSignal(() => 'Hello ' + props.name());
```

## createPatchableSignal

Creates a signal with JSON Patch support for fine-grained updates to complex objects:

```typescript
import { createPatchableSignal } from '@jay-framework/component';
import { REPLACE } from '@jay-framework/json-patch';

const [data, setData, patchData] = createPatchableSignal({
  label: 'Hello',
  count: 0,
  nested: { value: 42 },
});

// Patch a specific field
patchData({ op: REPLACE, path: ['label'], value: 'Updated' });

// Patch nested field
patchData({ op: REPLACE, path: ['nested', 'value'], value: 99 });
```

See [component-data.md](component-data.md) for more on immutable data and patching.

## createMemo

Creates a memoized computed value that recalculates only when dependencies change:

```typescript
import { createMemo } from '@jay-framework/component';

const fullName = createMemo(() => `${firstName()} ${lastName()}`);

// Read
fullName(); // recomputes only when firstName() or lastName() change
```

With initial value:

```typescript
const total = createMemo((prev) => prev + latestValue(), 0);
```

## createEffect

Registers a side effect that runs on mount and when dependencies change. Optional cleanup function:

```typescript
import { createEffect } from '@jay-framework/component';

createEffect(() => {
  const handler = () => setWindowWidth(window.innerWidth);
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler); // cleanup
});
```

Effects track reactive dependencies automatically:

```typescript
createEffect(() => {
  document.title = `${count()} items`; // reruns when count() changes
});
```

## createDerivedArray

Efficiently maps an array with smart caching. Only remaps items that actually changed:

```typescript
import { createDerivedArray } from '@jay-framework/component';

const displayItems = createDerivedArray(
  () => products(),
  (item, index, length) => ({
    name: item().name,
    displayPrice: formatPrice(item().price),
    isLast: index() === length() - 1,
  }),
);

// Read the mapped array
displayItems();
```

Key optimizations:

- Reuses mapped items when the source item hasn't changed
- Only tracks `index()` and `length()` if you actually call them
- Uses object identity (not deep equality) for cache hits

## createEvent

Creates an event emitter for component-to-parent communication:

```typescript
import { createEvent } from '@jay-framework/component';

const onChange = createEvent<{ value: number }>((emitter) => {
  emitter.emit({ value: count() });
});
```

## useReactive

Gets the current reactive context for advanced use cases:

```typescript
import { useReactive } from '@jay-framework/component';

const reactive = useReactive();
```

Most components won't need this — prefer the higher-level hooks above.
