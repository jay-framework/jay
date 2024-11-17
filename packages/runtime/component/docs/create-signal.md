# createSignal

Creates a reactive signal. The signal can be initialized using a value or a `Getter`.

If initialized with a Getter, the signal will track the Getter's signal value, useful for signals tracking prop values
while allowing to update the signal value directly.

```typescript
declare function createSignal<T>(value: ValueOrGetter<T>): [get: Getter<T>, set: Setter<T>]
```

## Parameters:

* `value`: The initial value of the signal, or another signal getter to track.

## Returns:

A tuple containing a `getter` and a `setter` for the signal's value.

* `getter: Getter<T>` function to get the signal value.
* `setter: Setter<T>` function to set the signal value. The setter function can receive a value or a `Next` function that
   given the old signal value will calculate the next signal value.

## Examples:

```typescript
const [count, setCount] = createSignal(initialValue);
```
