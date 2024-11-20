# createDerivedArray

Creates a derived mapped array that updates whenever the source array or its elements change.

When using immutable state, the `Array.map` function always creates a new array with new items.
`createDerivedArray` only recreates new items if the original item has changed, or a dependency of the mapping function
has changed. `createDerivedArray` is the reactive equivalent of `Array.map`.

The mapping function is recalculated if

- the original item has changed
- the item index has changed, and the mapping function is using the index signal
- the original array length has changed, and the mapping function is using the length signal
- any other signal the mapping function depends on has changed

```typescript
declare function createDerivedArray<T extends object, U>(
  arrayGetter: Getter<T[]>,
  mapCallback: (item: Getter<T>, index: Getter<number>, length: Getter<number>) => U,
): Getter<U[]>;
```

## Parameters:

- `arrayGetter: Getter<T[]>`: A getter function for the source array.
- `mapCallback`: A function that maps each item in the source array to a new value.
  - `item: Getter<T>`: the original array item
  - `index: Getter<number>`: the index of the original array item
  - `length: Getter<number>`: the length of the original array

## Returns:

A getter function for the derived array.

## Example

```typescript
const taskData = createDerivedArray(pillarTasks, (item, index, length) => {
  let { id, title, description } = item();
  return {
    id,
    taskProps: {
      title,
      description,
      hasNext: hasNext(),
      hasPrev: hasPrev(),
      isBottom: index() === length() - 1,
      isTop: index() === 0,
    },
  };
});
```

See the full example in [Scrum Board/lib/pillar.ts](../../../../examples/jay/scrum-board/lib/pillar.ts).
