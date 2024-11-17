# list-compare `listCompare<T, S>()`

The list compare library is an algorithm to compute the mutations needed to update list `A` into list `B`.

## list compare signature

The algorithm signature is 
```typescript
export interface MatchResult<T, S> {
    action: typeof ITEM_ADDED | typeof ITEM_MOVED | typeof ITEM_REMOVED;
    item?: T;
    pos: number;
    fromPos?: number;
    elem?: S;
}

declare function listCompare<T, S>(
    oldArray: RandomAccessLinkedList<T, S>,
    newArray: RandomAccessLinkedList<T, S>,
    mkElement: (T, id: string) => S,
): Array<MatchResult<T, S>> 
```

The algorithm creates a list of instructions, including `ITEM_ADDED`, `ITEM_MOVED` and `ITEM_REMOVED` to be applied 
to the `oldArray` in order to get to the `newArray`. 

## algorithm notes
* The algorithm **mutates the `oldArray` into `newArray`** as part of the algorithm.
* The algorithm efficiency is `O(N log(N))`.
* The algorithm is used by the `jay-json-patch`  to compute the JSON diff with support for item movement,
* The algorithm is used by the `jay-runtime` to compute how to update the DOM for repeated items in the most efficient way.
* The algorithm is using the `RandomAccessLinkedList<T, S>` to optimize performance
* The algorithm assumes items `T` have an `id` which is used to match the same item between `oldArray` into `newArray`.
* The algorithm assumes an item `T` may have an attached item `S`.
  * The attachment `S` is moved with the original item `T`.
  * The attachment is used by the `jay-runtime` package when ordering `ViewState` items, while the attachment is the DOM
    element associated with the `ViewState` item. This allows the algorithm instructions to be used for moving DOM elements.
  * The algorithm, when using attachments, also receives a `mkElement` function that is used for creating the attachment 
    for new items (items that appear in `newArray` but not in `oldArray` by `id` matching).

## Example

Consider the following two arrays:
```typescript
const array_1 = [{ id: 'a114'}, { id: 'a33'}, { id:  'a75'}, { id: 'a201'}, { id: 'a153'}, { id: 'a204'}, { id: 'a207'}]
const array_2 = [{ id: 'a114'}, { id: 'a75'}, { id: 'a153'}, { id: 'a204'}, { id: 'a207'}, { id: 'a210'}, { id: 'a201'}]

const result = listCompare(new RandomAccessLinkedList(array_1), new RandomAccessLinkedList(array_2), () => undefined);
expect(result).toEqual([
  { action: ITEM_REMOVED, item: { id: 'a33' }, pos: 1},
  { action: ITEM_MOVED, pos: 5, fromPos: 2 },
  { action: ITEM_ADDED, item: { id: 'a210' }, pos: 5},
])
```

## `RandomAccessLinkedList<T, S>`

A double-sided linked list implementation combined with a map `id -> LinkedListItem<T, S>` random access.
It is used by the `listCompare<T, S>()` algorithm for performance.

