# Reactive Paring fixes

Once implementing Reactive Pairing we started seeing anomalies in Jay that Reactives are flushed twice and when not needed.
This exposed a few problems and a design flaw with how Reactive Pairing works.

Reactive Pairing is the process at which when a reaction of reactive `A` is reading a signal from reactive `B`, 
once reactive `B` is flushed it will also flush reactive `A` to ensure it reruns any reactions that depend on `B`'s signal.

Reactive Pairing makes a lot of sense when `A` is a component reactive and `B` is a context reactive - at which point 
we want all the component using the context signals to rerun reactions and potentially re-render.

The problem happens in two cases -

1. `A` is a parent component, `B` a child component. during `A`'s element render function (run as a reaction of `A`), 
   we also run the child component constructor. Any signal read from `B` not in a reaction of `B` (but in the constructor)
   will trigger pairing such that when that `B` signal updates, `A` will flush.
2. `A` is a parent component, `B` a child component. When `B` emits an event using an effect (which is a reaction of `B`)
   when `A` handling the event reads any of `A` signal values it triggers pairing such that when `A` signal updates, `B` will flush.

The root cause is that Reactive Pairing is based on function call stack - when reading a signal of `B` within a reaction of `A` 
we create pairing. **This rule is way to generic**, yet has big advantage for the component - context case - no need to 
introduce a new API for the component to track context changes.

# Aside fixes as a result of the investigation 

Investigating this issue exposed a few other issues:

## Patch creating new objects when patching same values

the `jay-json-patch` library patch function used to always create new objects, even if the patch did not update
any value. Because Jay is using immutable objects, it caused the system to think there is a change, while there is none.

Consider the object
```typescript
const obj = { a: 1, b: 2, c: 3 };
```

Applying a patch such as 
```typescript
const thePatch = [
    { op: REPLACE, path: ['b'], value: 2 },
    { op: REPLACE, path: ['c'], value: 3 },
];
```

does not change the object, and those patch now returns the original object
```typescript
expect(patch(obj, thePatch)).toBe(obj)
```

## createDerivedArray

The createDerivedArray hook in `jay-component` used to be implemented using a Reactive for each mapped item. 
This implementation was subject to the Reactive pairing issue above, as well as sub-optimal.

It is now implemented in a simpler and more efficient way.

## component mount

Component mount function did not check if the component is mounted, and could have run twice in some cases.

We have changed component mount to be a signal with the actual mount / unmount logic a reaction, to ensure more consistent 
behaviour

# Fixing Reactive Pairing

It is clear that using only function call stack the reactive pairing is way too aggressive. 

1. We want reactive pairing between context (providing signals) and components (reading signals).
2. We want reactive pairing between context (providing signals) and other contexts (reading signals).
3. We do not want components to provide signals for reactive pairing.

## option 1

We can extend Reactive with Reactive Pairing configuration such that 
* Components will be configured as (reading signals)
* Contexts will be configured as (reading or providing signals)

This option can still create unexpected pairings

## option 2

Explicit pairing API, such that `A` will have to enable tracking `B`'s state. 
Can we create such an API that will not pollute the usage of context API? probably.

one way of doing so is to have an API `A.enableReadingfrom(B)` which means that `A` will now track signals of `B`.

This is the preferred way, as it is not too eager, will likely not cause unexpected issues and also means 
`A` points at `B`, and given `A` is a component and `B` a context, `A` is more likely to be cleared. Pointing `B` to `A` 
can cause a memory leak, but the reverse is less likely to.