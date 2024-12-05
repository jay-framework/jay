# Jay Reactive Module

The Reactive module is a minimal reactive core implementation that handles storing data,
reacting to data change and detecting if data has actually changed.

Reactive will strive to run reactions as a batch and will do so **sync** when using `batchReactions` or
**async** if `batchReactions` was not used. When there are pending reactions to be run async, `toBeClean`
can be used to wait for the reactions to run using `await reactive.toBeClean()`.

The package one class - the `Reactive` which is a simple reactive core, at which reactions are dependent on signals.
When a signal is updated, any of the dependent reactions are re-run.

The reactions auto track which signals they depend on. On each run of a reaction,
it will recalculate dependencies to ensure it only depends on signal values that are actually in use.
A direct impact is that conditions based on signals are supported in reactions, and the reaction rerun will take
into account the conditions.

Reactive can also pair, creating dependencies between multiple Reactive instances. See the section below on Reactive Pairing

## Notes:

- `Reactive` is intended to be an internal core implementation for state management and not a user facing API.
- `Reactive` is used by `jay-component` as state management for components, at which each component has it's own independent
  instance of `Reactive`.
- `jay-component` also defines reactive context which is also using an independent `Reactive` instance.
- one `Reactive` can depend on a signal from another `Reactive` creating `Reactive` pairing discussed below.
- `jay-reactive` is inspired by [solid.js](https://www.solidjs.com/) state management (amazing framework, BTW).
- `Reactive.enable` and `Reactive.disable` are used by `jay-component` to disable and enable reactive as a component unmounts and mounts.

## createSignal

```typescript
type Next<T> = (t: T) => T;
type Setter<T> = (t: T | Next<T>) => T;
type Getter<T> = () => T;
type ValueOrGetter<T> = T | Getter<T>;
declare function createSignal<T>(
  value: ValueOrGetter<T>,
  measureOfChange: MeasureOfChange = MeasureOfChange.FULL,
): [get: Getter<T>, set: Setter<T>];
```

Creates a signal getter / setter pair such that when setting signal value, any dependent reaction is rerun.
The reactions run on `setTimeout(...,0)`, or at the end of a batch when using `batchReactions`.

The getter always returns the signal value
The setter accepts a new value or a function to compute the next value, as well as a `MeasureOfChange`.

```typescript
const [getter, setter] = reactive.createSignal(12);

getter(); // returns 12
setter(13);
setter((x) => x + 1);

const [getter2, setter2] = reactive.createSignal(() => `signal value is ${getter()}`);
```

### createSignal parameters

- `value: ValueOrGetter<T>` - an initial value for the signal, or a getter function to track using `createReaction`.
- `measureOfChange: MeasureOfChange = MeasureOfChange.FULL` - an indicator of how large a change is signal is considered
  within reactions that depend on this signal (when a reaction is run, it also gets the `max(...measureOfChange)`
  of all signals that have changed and it depends on).

### getter

the first function returned by `createSignal` is the `getter` function which returns the current value of the signal.

### setter

The second function returned is `setter` which accepts one parameter - a new value for the signal,
or a function to update the signal value. Note that a change is defined by strict equality - using the `===` and `!==` operators.

## createReaction

```typescript
export type Reaction = (measureOfChange: MeasureOfChange) => void;
reactive.createReaction(func: Reaction);
```

Creates a reaction that re-runs when signals it depends on changes.
It will re-run on `setTimeout(..., 0)`, or at the end of a batch when using `batchReactions`.
The `Reaction` accepts a `MeasureOfChange` computed as the `max(...measureOfChange)`
of all signals that have changed and the reaction depends on.

The `Reaction` function is running once as part of the call to `createReaction` used to figure out what
initial dependencies to track. On each run of the `Reaction` function dependencies are recomputed and the
function will only rerun with relevant dependencies are updated.

```typescript
reactive.createReaction(() => {
  console.log(signalGetter());
});
```

Note that only dependencies (signal getters) that are actually in use are set as dependencies.
In the following case, the reaction will track signals `a` and `b`, but will not track signal `c` (by design).

```typescript
const [a, setA] = reactive.createSignal(true);
const [b, setB] = reactive.createSignal('abc');
const [c, setC] = reactive.createSignal('def');

reactive.createReaction(() => {
  if (a()) b();
  else c();
});
```

Once `a` or `b` update, the reaction will rerun.

If `a` is set to false, the reaction will now depend on `a` and `c`.

## batchReactions

```typescript
reactive.batchReactions(func: () => void);
```

Batch reaction enables to update multiple signals while computing reactions only once. It is important for
performance optimizations, to enable rendering DOM updates once when a component updates multiple signals. It
is built for the component API to optimize rendering.

```typescript
let reactive = new Reactive((reactive) => {
  const [a, setA] = reactive.createSignal(false);
  const [b, setB] = reactive.createSignal('abc');
  const [c, setC] = reactive.createSignal('def');
  reactive.createReaction(() => {
    console.log(a(), b(), c());
  });
});
// will print the console log false abc def

reactive.batchReactions(() => {
  setA(true);
  setB('abcde');
  setC('fghij');
});
// will print the console log true abcde fghij
```

## toBeClean

```typescript
reactive.toBeClean(): Promise<void>;
```

returns a promise that is resolved when pending reactions have run. If there are no pending reactions, the promise
will resolve immediately.

```typescript
setA(12);
setB('Joe');
// waits for reaction to run
await reactive.toBeClean();
```

## flush

```typescript
reactive.flush(): void;
```

In the case of not using batch reactions, reactive will auto batch the reactions and run them async.
`flush` can be used to force the reactions to run sync.

```typescript
setA(12);
setB('Joe');
// forces reactions to run synchronosly
reactive.flush();
```

## enable & disable

```typescript
reactive.enable();
reactive.disable();
```

Enables and disables the reactive.
A Disabled reactive will not run reactions.

- When calling enable, the reactive will also flush any pending reactions.
- Reactive are created, by default, enabled.

## MeasureOfChange

Measure of Change is an optional value passed when creating signals, which is then used to tune how reactions run.
The `MeasureOfChange` is defined as an ordered enum, at which case the reaction always gets the max `MeasureOfChange`
from signals that are updated.

It is defined as

```typescript
export enum MeasureOfChange {
  NO_CHANGE,
  PARTIAL,
  FULL,
}
```

At which

- `NO_CHANGE` - allows to update a signal without triggering reactions
- `PARTIAL` - triggers reactions with the `PARTIAL` measure of change, unless other signals are updated with a higher measure of change
- `FULL` - triggers reactions with the `FULL` measure of change

see the `jay-component` library, the `createDerivedArray` function for an example use case.

## enablePairing

Reactive Pairing is useful when an application has multiple reactive instances who need to sync flush between them.
For instance, with Jay, a context is one reactive and component is another instance of a reactive.

Pairing is created explicitly using the `enablePairing` API, 
then by reading a signal value of reactive `A` from a reaction of reactive `B`. 
When paired, once reactive `A` flushes, it will also trigger a flush of reactive `B` after `A` flush completes, 
which will re-run the reaction in `B` that have read a signal value of `A`.

```typescript
reactive.enablePairing(anotherReactive);
```

* `reactive` the reactive from which `anotherReactive` signal values are read. In Jay, a component. The `B` above.
* `anotherReactive` the reactive from which signal values are read. In Jay, a context. The `A` above.

example:
```typescript
B.enablePairing(A)
```

# Reactive Tracing

The reactive library includes the facility to trace how Reactive signals and reactions are running. 

To enable reactive tracing, import the `jay-reactive/tracing` module before starting jay.

```typescript
import 'jay-reactive/tracing'
```

Reactive tracing outputs tracing similar to the following:
```
// on counter example creation
A - createSignal A1
A - createSignal A2
A - createSignal A3
A - I: (A3) -> () --> ()
A - II: () -> () --> ()
A - flush!!!
A - flush end
A - batch: -> (A1) --> ()
A - flush!!!
A - flush end
A - batch: -> (A3) --> (A - I)
A - flush!!!
  A - I: (A3) -> () --> ()
A - flush end

// on counter click on a button
A - flush!!!
A - flush end
A - batch: -> (A3) --> (A - I)
A - flush!!!
  A - I: (A3) -> () --> ()
A - flush end
```

The trace should be read as:

* `A` - each Reactive gets a letter as a name, like `A`, `B`, `C`, etc.
* `A - createSignal A1` - creating the first signal. 
  * Signals are named after the reactive name + a serial number, like `A1`, `A2`, `A3`, `B1`, etc.
* `A - I: (A3) -> () --> ()` - running a reaction, including on reaction creation. 
  * Reactions are named after the reaction name + serial roman number, like `A - I`, `A - II`, `A - III`, etc.
  * The first `()` are the signals read (using getters) in the reaction.
  * The second `()` are signals written (using setters) in the reaction.
  * The third `()` are reactions to run once this reaction is running.
* `A - batch: -> (A3) --> (A - I)` - a batch reaction setting the `A3` signal and scheduling the `A - I` reaction to run.