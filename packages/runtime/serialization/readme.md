# Jay Serialization

A **stateful serialization** implementation that serializes an **object** into a **diff** to be applied to another
**object** on the other side.

The algorithm is useful when two parties have frequent updates of an updated object sent from party `A` to party `B`.

1. Party `A` calls the `serialize` function which produces a `JSONPatch` and a new `seralize`
   function to compute the next patch.
2. Party `B` receives the `JSONPatch`, using `deserialize` gets the updated object and a new `deserialize` function
   to apply the next patch.

## Signature

```typescript
export type Serialize<T extends object> = (
  entity: any,
  contexts?: ArrayContexts,
) => [JSONPatch, Serialize<T>];
declare function serialize<T extends object>(
  entity: any,
  contexts?: ArrayContexts,
): [JSONPatch, Serialize<T>];

export type Deserialize<T extends object> = (jsonPatch: JSONPatch) => [T, Deserialize<T>];
declare function deserialize<T extends object>(jsonPatch: JSONPatch): [T, Deserialize<T>];
```

## library notes

- The library assumes the object to serialize and deserialize are immutable objects.
  It always creates new instances in deserialization.
- The library serialization always serializes the first object in full on the path `[]`,
  which is then deserialized as is.
- It is using the `@jay-framework/json-patch` library to compute and apply the `JSONPatch`es.
- The `ArrayContexts` parameter is the same from the `@jay-framework/json-patch` library.
- The library is used by `@jay-framework/secure` for the worker - main context communication.
- The library can also be used for server - client communication if also using global object version management,
  such as optimistic locking.

## examples

Serialization:

```typescript
let [patch, nextSerialize] = serialize({ a: 1, b: 2, c: 'abcd', d: true });
expect(patch).toEqual([{ op: ADD, path: [], value: { a: 1, b: 2, c: 'abcd', d: true } }]);

[patch, nextSerialize] = nextSerialize({ a: 11, b: 2, c: 'abcd', d: true });
expect(patch).toEqual([{ op: REPLACE, path: ['a'], value: 11 }]);

[patch, nextSerialize] = nextSerialize({ a: 11, b: 12, c: 'abcd', d: true });
expect(patch).toEqual([{ op: REPLACE, path: ['b'], value: 12 }]);
```

Deserialization:

```typescript
let [target, nextSerialize] = deserialize([
  { op: ADD, path: [], value: { a: 1, b: 2, c: 'abcd', d: true } },
]);
expect(target).toEqual({ a: 1, b: 2, c: 'abcd', d: true });

[target, nextSerialize] = nextSerialize([{ op: REPLACE, path: ['a'], value: 11 }]);
expect(target).toEqual({ a: 11, b: 2, c: 'abcd', d: true });

[target, nextSerialize] = nextSerialize([{ op: REPLACE, path: ['b'], value: 12 }]);
expect(target).toEqual({ a: 11, b: 12, c: 'abcd', d: true });
```
