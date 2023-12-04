# Reactive Module

The Reactive module is a minimal reactive core implementation that handles storing data,
reacting to data change and detecting if data has actually changed.

Reactive will strive to run reactions as a batch and will do so **sync** when using `batchReactions` or
**async** if `batchReactions` was not used. When there are pending reactions to be run async, `toBeClean`
can be used to wait for the reactions to run using `await reactive.toBeClean()`.

It is intended to be an internal core implementation for state management and not a user facing API.

The package one class - the `Reactive` which is a simple reactive core, at which reactions are dependent on state.
When a state is updated, any of the dependent reactions are re-run.

- [record](#record)
- [createState](#createState)
- [createReaction](#createReaction)
- [MeasureOfChange](#MeasureOfChange)
- [batchReactions](#batchReactions)
- [toBeClean](#toBeClean)
- [flush](#flush)

# <a name="record">Record</a>

```typescript
declare function record<T>(func: (reactive: Reactive) => T): T;
```

Used to create the reactive dependency tree.
Reactive runs any internal calls to `createReaction` and records any reading of `state`, which are recorded
as dependencies of that specific reaction. When the state changes, the reaction will rerun.

For example, the following will run the reaction every 1000ms when we increase the state

```typescript
reactive.record((reactive) => {
  let [state, setState] = reactive.createState(12);
  reactive.createReaction(() => console.log(state()));

  setInterval(() => {
    setState((x) => x + 1);
  }, 1000);
});
```

# <a name="createState">createState</a>

```typescript
type Next<T> = (t: T) => T;
type Setter<T> = (t: T | Next<T>) => T;
type Getter<T> = () => T;
declare function createState<T>(
  value: T | Getter<T>,
  measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
): [get: Getter<T>, set: Setter<T>];
```

Creates a state getter / setter pair such that when setting state, any dependent reaction is rerun.
The reactions run on `setTimeout(...,0)`, or at the end of a batch when using `batchReactions`.

The getter always returns the state value
The setter accepts a new value or a function to compute the next value, as well as a `MeasureOfChange`.

```typescript
const [state, setState] = reactive.createState(12);

state(); // returns 12
setState(13);
setState((x) => x + 1);
```

## state

the first function returned by `createState` is the `state` function which returns the current value of the state.

## setState

The second function returned is `setState` which accepts two parameters

- a new value for the state, or a function to update the state value
- a `MeasureOfChange` which can be used by reactions how to react to a change
  The function will trigger reactions if the value has changed.

Note that a change is defined by strict equality - using the `===` and `!==` operators.

# <a name="createReaction">createReaction</a>

```typescript
export type Reaction = (measureOfChange: MeasureOfChange) => void;
declare function createReaction(func: Reaction);
```

creates a reaction that re-runs when state it depends on changes.
It will re-run on `setTimeout(..., 0)`, or at the end of a batch when using `batchReactions`.
The `Reaction` accepts a `MeasureOfChange` parameter which can be used to fine tune how the reaction should behave.

The `Reaction` function is running once as part of the call to `createReaction` used to figure out what dependencies to
track.

```typescript
reactive.createReaction(() => {
  console.log(state());
});
```

Note that only dependencies (state getters) that are actually called during the construction phase are recorded.
In the following case, the reaction will track states `a` and `b`, but will fail to track state `c`

```typescript
const [a, setA] = reactive.createState(true);
const [b, setB] = reactive.createState('abc');
const [c, setC] = reactive.createState('def');

reactive.createReaction(() => {
  if (a()) b();
  else c();
});
```

# <a name="MeasureOfChange">MeasureOfChange</a>

Measure of Change is an optional value passed when creating state, which is then used to tune how reactions run.
The `MeasureOfChange` is defined as an ordered enum, at which case the reaction always gets the max `MeasureOfChange`
from states that are updated.

It is defined as

```typescript
export enum MeasureOfChange {
  NO_CHANGE,
  PARTIAL,
  FULL,
}
```

At which

- `NO_CHANGE` - allows to update a state without triggering reactions
- `PARTIAL` - triggers reactions with the `PARTIAL` measure of change, unless other states are updated with a higher measure of change
- `FULL` - triggers reactions with the `FULL` measure of change

see the `jay-component` library, the `createDerivedArray` function for an example use case.

# <a name="batchReactions">batchReactions</a>

```typescript
declare function batchReactions(func: () => void);
```

Batch reaction enables to update multiple states while computing reactions only once. It is important for
performance optimizations, to enable rendering DOM updates once when a component updates multiple states. It
is built for the component API to optimize rendering.

```typescript
let reactive = new Reactive((reactive) => {
  const [a, setA] = reactive.createState(false);
  const [b, setB] = reactive.createState('abc');
  const [c, setC] = reactive.createState('def');
  reactive.createReaction(() => {
    console.log(a(), b(), c());
  });
});

reactive.batchReactions(() => {
  setA(true);
  setB('abcde');
  setC('fghij');
});
```

# <a name="toBeClean">toBeClean</a>

```typescript
declare function toBeClean(): Promise<void>;
```

returns a promise that is resolved when pending reactions have run. If there are no pending reactions, the promise
will resolve immediately.

```typescript
reactive.setStateA(12);
reactive.setStateB('Joe');
// waits for reaction to run
await reactive.toBeClean();
```

# <a name="flush">flush</a>

```typescript
declare function flush(): void;
```

In the case of not using batch reactions, reactive will auto batch the reactions and run them async.
`flush` can be used to force the reactions to run sync.

```typescript
reactive.setStateA(12);
reactive.setStateB('Joe');
// forces reactions to run
reactive.flush();
```
