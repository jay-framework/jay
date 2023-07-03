# Mutable Module

The mutable module is a simple proxy over an object which tracks changes to the object and implements the 
`jay-reactive` `MutableContract` interface. The changes are indicated using both an update of the revision and the change listeners.

The package consists of a single function -  

* [mutableObject](#mutableObject)

# <a name="mutable">Mutable</a>

The mutable module adds support for mutable objects on top of reactive state management.
A Mutable object manages an internal revision number (based on `Revisioned` below) that is updated any time its values,
direct or indirect children values change. Once the revision number is updated, the mutable also calls
each of its mutable listeners.

The Mutable module is creating proxies for the original objects that are pass-trough, tracking the changes.

Creating a mutable proxy
```typescript
let obj = {
    a: 1,
    b: {
        c: 2, 
        d: 3
    }, 
    arr: [
        {e: 4}, 
        {e: 5}, 
        {e:6}
    ]};
let mutableObj = mutableObject(obj);
```

updates that trigger revision update
```typescript
// update revision of mutableObj
mutableObj.a = 7

// update revision of mutableObj and mutableObj.b
mutableObj.b.c = 7

// update revision of mutableObj and mutableObj.b
mutableObj.b.c = 7

// update revision of mutableObj,  mutableObj.arr and mutableObj.arr[1] 
mutableObj.arr[1].e = 7

// update revision of mutableObj,  mutableObj.arr
mutableObj.arr[1].push({e: 12})
```

When using Mutable with `createState`, createState adds a change listener on the mutable object to run
reactions when a mutable object changes

```typescript
let [theState, setTheState] = reactive.createState(mutableObject(obj));

reactive.createReaction(() => console.log(theState()));

// updating the mutable object triggers change listener which triggers state change, and in turn triggers
// the reaction to print to the console.
obj.b.c = 7;

```

## <a name="mutableObject">mutableObject</a>

Creates a mutable proxy object or a mutable proxy array over a base object.
The notify parent callback is called any time the mutable object changes.

```typescript
declare function mutableObject<T extends object>(original: T, notifyParent?: ChangeListener): T
declare function mutableObject<T>(original: Array<T>, notifyParent?: ChangeListener): Array<T>
```

