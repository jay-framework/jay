# createSignal

Creates a reactive signal. The signal can be initialized using a value or a `Getter`.

If initialized with a Getter, the signal will track the Getter's signal value, useful for signals tracking prop values
while allowing to update the signal value directly.

```typescript
declare function createSignal<T>(value: ValueOrGetter<T>): [get: Getter<T>, set: Setter<T>];
```

## Parameters:

- `value`: The initial value of the signal, or a function that returns a value track.

If the value is a function, createSignal automatically wraps it with Reactive's createReaction
creating a dependency between any signals read within the function and the created signal.

## Returns:

A tuple containing a `getter` and a `setter` for the signal's value.

- `getter: Getter<T>` function to get the signal value.
- `setter: Setter<T>` function to set the signal value. The setter function can receive a value or a `Next` function that
  given the old signal value will calculate the next signal value.

## Examples:

Creating a signal with an initial value
```typescript
const [count, setCount] = createSignal(initialValue);
```

Creating a signal that follows two other signal values
```typescript
const [a, setA] = createSignal(10);
const [b, setB] = createSignal(20);
const [c, setC] = createSignal(() => a() + b());
```
In the above example, the signal `c` can be updated using the `setC` setter, or it is updated automatically 
whenever the signals `a` or `b` are updated.
