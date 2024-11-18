# createPatchableSignal

Creates a reactive signal that also supports update using `JSONPatch`. 

As Jay is using immutable state objects, when we need to update a deep structure of objects, we have to replace 
the updated object and all parent objects. `createPatchableSignal` is a utility that is using the same `patch` from 
`jay-json-patch` to simplify this update.

```typescript
declare function createPatchableSignal<T>(
        value: ValueOrGetter<T>,
): [get: Getter<T>, set: Setter<T>, patchFunc: Patcher<T>]
```

## Parameters:

* `value`: The initial value of the signal.

## Returns:

A tuple containing a `getter`, a `setter`, and a `patch` function.

* `getter: Getter<T>` function to get the signal value.
* `setter: Setter<T>` function to set the signal value. The setter function can receive a value or a `Next` function that
  given the old signal value will calculate the next signal value.
* `patch: Patcher<T>` function to patch the signal value using `...JSONPatch` (spread json patch). 

## Examples:

```typescript
const [todos, setTodos, patchTodos] = createPatchableSignal(
    initialTodos().map((_) => ({ ..._, isEditing: false, editText: '' })),
);

// in some event handler
patchTodos(
    { op: REPLACE, path: [itemIndex, 'title'], value: val },
    { op: REPLACE, path: [itemIndex, 'isEditing'], value: false },
);

// in another event handler
patchTodos({
    op: ADD,
    path: [todos().length],
    value: {
        id: uuid(),
        title: val,
        isEditing: false,
        editText: '',
        isCompleted: false,
    },
});
```
See the full example in [todo-one-flat-component/lib/todo.ts](../../../../examples/jay/todo-one-flat-component/lib/todo.ts).