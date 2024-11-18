# createMemo

Creates a memoized value that updates only when its dependencies change.

```typescript
declare function createMemo<T>(computation: (prev: T) => T, initialValue?: T): Getter<T>
```

## Parameters:

* `computation`: A function that calculates the new value based on the previous value.
* `initialValue`: The initial value of the memo.

## Returns: 

A getter function for the memoized value.

## Example:

```typescript
const activeTodoCount = createMemo(() =>
    todos().reduce(function (accum: number, todo: ShownTodo) {
        return todo.isCompleted ? accum : accum + 1;
    }, 0),
);
const noActiveItems = createMemo(() => activeTodoCount() === 0);
const activeTodoWord = createMemo(() => (activeTodoCount() > 1 ? 'todos' : 'todo'));
const hasItems = createMemo(() => todos().length > 0);
const showClearCompleted = createMemo(() => !!todos().find((_) => _.isCompleted));
```
See the full example in [Todo/lib/todo.ts](../../../../examples/jay/todo/lib/todo.ts).