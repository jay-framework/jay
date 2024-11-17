# JSON Patch algorithm (diff, patch)

JSON Patch compatible with RFC 6902 from the IETF, with support for item movement and immutable objects,
[JSON Patch page](https://jsonpatch.com/)

This JSON Patch algorithm is unique by it's support for array item movement (`move` operation). 
Most other JSON Patch algorithm, when faced with a new item in an array, will resort for `add`, `replace` 
and `remove` operations 
[See overview of other implementations](../../../design-log/23 - JSON compare and patch.md)

## The diff signature

```typescript
type MeasureOfChange = number;
type DataFields = number;
type ArrayContext = {
    matchBy: string;
};
export type ArrayContexts = [JSONPointer, ArrayContext][];

declare function diff<T>(
    newValue: T,
    oldValue: T,
    contexts?: ArrayContexts,
    path: JSONPointer = [],
): [JSONPatch, MeasureOfChange, DataFields]
```

The `diff` function accepts two values and computes the difference between.

n default mode, it only supports `add` and `remove` operations. 
In order to support `move` a `contexts: ArrayContexts` 3rd parameter has to be provided. 
The `ArrayContexts` is an array of tuples including `JSONPointer` and `ArrayContext` which instruct the algorithm
how to compare the array at the `JSONPointer` location. The `ArrayContext` has the name of an attribute to match object by,
the same `id` used by `jay-list-compare`.

The `path` parameter is internal for the function working recursively.

The function returns a tuple of 3 values - 
* `JSONPatch` - the computed patch
* `MeasureOfChange = nummber` - the number of atomic data fields that have changed
* `DataFields = number` - the number of atomic data fields that have been compared

## The patch signature

```typescript
declare function patch<T>(target: T, jsonPatch: JSONPatch, level = 0): T
```

The function receives a `target` object and a `jsonPatch` and always returns a new object. 
The `level` parameter is internal for the function working recursively.

## Algorithm notes
* This algorithm is using the `jay-list-compare` package to compute array mutations.
* This algorithm is using the `MeasureOfChange` and `DataFields` at each level to decide if to 
  use detailed patch of sub-objects, or to just replace the whole object.
  The threshold is `measureOfChange / dataFields > 0.5` (not configurable for now).

## Example diff

```typescript
const NESTED_ARRAY_CONTEXT: ArrayContexts = [
    [['b'], { matchBy: 'id' }],
];
const patch = diff(
    {
        a: 1,
        b: [
            { id: 1, c: '1' },
            { id: 2, c: '2' },
            { id: 3, c: '3' },
            { id: 5, c: '5' },
            { id: 7, c: '7' },
            { id: 6, c: '6' },
        ],
    },
    {
        a: 1,
        b: [
            { id: 1, c: '1' },
            { id: 3, c: '3' },
            { id: 4, c: '4' },
            { id: 2, c: '2' },
            { id: 5, c: '5' },
            { id: 6, c: '6' },
        ],
    },
    NESTED_ARRAY_CONTEXT,
);

expect(patch[0]).toEqual([
    { op: MOVE, from: ['b', 3], path: ['b', 1] },
    { op: REMOVE, path: ['b', 3] },
    { op: ADD, path: ['b', 4], value: { id: 7, c: '7' } },
]);
```

## Examples patch

add example
```typescript
const obj = patch(
        { a: 1, b: 2, c: 3 }, 
        [{ op: ADD, path: ['d'], value: 4 }]);

expect(obj).toEqual({ a: 1, b: 2, c: 3, d: 4 });
```

move example
```typescript
const original = [
  { id: 1, c: '1' },
  { id: 2, c: '2' },
  { id: 3, c: '3' },
];
const patched = patch(original, 
        [{ op: MOVE, path: [1], from: [2] }]);

expect(patched).toEqual([
  { id: 1, c: '1' },
  { id: 3, c: '3' },
  { id: 2, c: '2' },
]);
```