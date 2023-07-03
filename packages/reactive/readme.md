# Reactive Module

The Reactive module is a minimal reactive core implementation that handles storing data, 
reacting to data change and detecting if data has actually changed.

Reactive will strive to run reactions as a batch and will do so **sync** when using `batchReactions` or 
**async** if `batchReactions` was not used. When there are pending reactions to be run async, `toBeClean` 
can be used to wait for the reactions to run using `await reactive.toBeClean()`. 

It is intended to be an internal core implementation for state management and not a user facing API.
                               
The package has 2 modules

* [Reactive](#reactive)
  * [Reactive constructor](#constructor)
  * [createState](#createState)
  * [createReaction](#createReaction)
  * [batchReactions](#batchReactions)
  * [toBeClean](#toBeClean)
  * [flush](#flush)
* [MutableContract](#MutableContract)
* [Revisioned](#revisioned)
  * [checkModified](#checkModified)
  * [touchRevision](#touchRevision)
  * [getRevision](#getRevision)
  * [setRevision](#setRevision)
  * [getRevNum](#getRevNum)
  * [nextRevNum](#nextRevNum)

# <a name="reactive">Reactive Class</a>        
                                     
The Reactive class is a simple reactive core, at which reactions are dependent on state. 
When a state is updated, any of the dependent reactions are re-run. 


## <a name="constructor">Reactive constructor</a>
```typescript
interface ReactiveConstructs {
    createState<T>(value: T | Getter<T>): [get: Getter<T>, set: Setter<T>]
    createReaction(func: () => void)
}

new Reactive(func: (reactive: ReactiveConstructs) => void)
```

Creates a new Reactive and runs immediately the provided func. During the running of the constructor,
Reactive runs any internal calls to createReaction and records any reading of state, which are recorded 
as dependencies of that specific reaction.

For example, the following will run the reaction every 1000ms when we increase the state

```typescript
new Reactive((reactive) => {
    let [state, setState] = reactive.createState(12);
    reactive.createReaction(() => console.log(state()))

    setInterval(() => {
        setState(x => x+1)
    }, 1000)
})

```

## <a name="createState">createState</a>
```typescript
type Next<T> = (t: T) => T
type Setter<T> = (t: T | Next<T>) => T
type Getter<T> = () => T
ReactiveConstructs.createState<T>(value: T | Getter<T>): [get: Getter<T>, set: Setter<T>]
```

Creates a state getter / setter pair such that when setting state, any dependent reaction is rerun.
The reactions run immediately, or at the end of a batch when using `batchReactions`.

The getter always returns a state value
The setter accepts a new value or a function to compute the next value

```typescript
const [state, setState] = reactive.createState(12);

state() // returns 12
setState(13);
setState(x => x + 1);
```

### state

the first function returned by `createState` is the `state` function which returns the current value of the state.

### setState

The second function returned is `setState` which accepts a new value or function to update the value.
The function will trigger reactions if the value has changed - changed is defined by `Revisioned` discussed below.

## <a name="createReaction">createReaction</a>
```typescript
ReactiveConstructs.createReaction(func: () => void)
```

creates a reaction that re-runs when state it depends on changes. 
It will re-run immediately, or at the end of a batch when using `batchReactions`.

The reaction function is running once as part of the constructor of `Reactive` at which dependencies are 
tracked.

```typescript
reactive.createReaction(() => {
    console.log(state())
})
```

Note that only dependencies (state getters) that are actually called during the construction phase are recorded.
In the following case, the reaction will track states `a` and `b`, but will fail to track state `c`

```typescript
const [a, setA] = reactive.createState(true);
const [b, setB] = reactive.createState('abc');
const [c, setC] = reactive.createState('def');

reactive.createReaction(() => {
    if (a())
        b();
    else
        c();
})
```


## <a name="batchReactions">batchReactions</a>
```typescript
Reactive.batchReactions(func: () => void)
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
        console.log(a(), b(), c())
    })
})

reactive.batchReactions(() => {
    setA(true);
    setB('abcde');
    setC('fghij');
})
```

## <a name="toBeClean">toBeClean</a>
         
```
Reactive.toBeClean(): Promise<void>
```

returns a promise that is resolved when pending reactions have run. If there are no pending reactions, the promise
will resolve immediately.

```typescript
reactive.setStateA(12)
reactive.setStateB('Joe')
// waits for reaction to run
await reactive.toBeClean() 
```

## <a name="flush">flush</a>
         
```
Reactive.flush(): void
```

In the case of not using batch reactions, reactive will auto batch the reactions and run them async. 
`flush` can be used to force the reactions to run sync.

```typescript
reactive.setStateA(12)
reactive.setStateB('Joe')
// forces reactions to run
reactive.flush() 
```

# <a name="MutableContract">MutableContract</a>

The mutable contract defines how `Reactive` handles objects who are mutable, detects changes on those objects, 
and triggers reactions when they change.

```typescript
export interface MutableContract {
  isMutable(): true
  addMutableListener(changeListener: ChangeListener)
  removeMutableListener(changeListener: ChangeListener)
  getRevision(): number
  setRevision(revNum: number)
  getOriginal(): object
}
```

* `isMutable` must return `true`
* `addMutableListener` adds a listener that should be called when the mutable object changes
* `removeMutableListener` removes the change listener
* `getRevision` returns a number that represents the state of the mutable object. It is expected that on any change 
  in the state of the mutable object (including deep properties), the revision number will change.
* `setRevision` sets the revision number
* `getOriginal` if the mutable object is a proxy, returns the original object

# <a name="revisioned">Revisioned</a>

The Revisioned subsystem is a system to identify changes in values while supporting both primitives,
immutable objects and mutable objects.

The main function is `checkModified` which compares values, indicating if they are the same or not, based on equality or revision.

* primitives are considered changed if `a !== b`
* regular objects are considered changed if `a !== b`
* revisioned objects are considered changed if `a.getRevision() !== b.getRevision()`

The module also handles a `nextRevNum` which is ensured to return a new, unique and larger revnum.

## <a name="checkModified">checkModified</a>

The check modified function compares two values - a given new value, and an old `Revisioned` value.
The function compares the new value with the old value using the rules above, and returns a
new revisioned instance and a is changed flag.

```typescript
interface Revisioned<T> {
    value: T,
    revision: number
}

declare function checkModified<T>(value: T, oldValue?: Revisioned<T>): [Revisioned<T>, boolean]
```

## <a name="touchRevision">touchRevision</a>

the `touchRevision` function marks an object as mutable and updates the object revision

```typescript
declare function touchRevision<T extends object>(value: T): T
```

## <a name="getRevision">getRevision</a>
gets a revisioned instance with the object, with revNum for object implementing the `MutableContract`, or `NaN` revnum for all other inputs.
```typescript
declare function getRevision<T extends object>(value: T): Revisioned<T>
```

## <a name="setRevision">setRevision</a>
sets the revision for object implementing the `MutableContract`
```typescript
declare function setRevision<T extends object>(value: T, revision: number) 
```

## <a name="getRevNum">getRevNum</a>
gets the revision for object implementing the `MutableContract`, or `NaN`
```typescript
declare function getRevNum(value: any)
````

## <a name="nextRevNum">nextRevNum</a>
gets the next, unique and larger revision number
```typescript
declare function nextRevNum(): number
```


