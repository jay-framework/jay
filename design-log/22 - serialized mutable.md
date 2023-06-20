Serialized Mutable
====

Working on the secure version of the TodoMVC example, here comes an unexpected challenge - 
serialization of mutable fails!

However, this is actually good news as it highlights a design flaw with mutables and serialization.

Why do we use mutable?
----

In the `todo.ts` component file, we are using mutable state for the todo items

```typescript
const [todos, setTodos] = createState(mutableObject(
  initialTodos().map(_ => ({..._, isEditing: false, editText: ''}))));
```

Why mutable? 
1. it is more efficient for rendering, as only todo items who have been modified will be rendered
2. it is simpler to update in event handlers

Why do we have a problem?
----

The immediate issue is that `mutableObject` is based on a Proxy, and proxy is not serializable by default.

But the more interesting case is the conceptual one - when serializing an object twice at two 
different states, the parsing creates two different objects - it does not create one and then update it!

The expected behaviour is

![Diagram](22%20-%20serialized%20mutable%20expected%20diagram.svg)

But the actual behaviour is

![Diagram](22%20-%20serialized%20mutable%20actual%20diagram.svg)


How do we solve this challenge?
----

### problem 1 - finding the instance in the second context

In general, serializing mutable across contexts requires knowing object identity which is then used on 
deserialization to find the target object and to apply to it updates from the serialized stream.

Knowing a global object identity is a tricky business as it requires some kind of global registry and global id.
Both are possible using a global counter on the first context and a `weakmap` of id to instance.

However, in the case of Jay, we have Jay messages, of which only the `render` and `root` messages can have a mutable payload, 
and the messages gives us the method to find the target object on the second context. 
* `root` message sent from main to the sandbox root, updating the sandbox root `viewState`
* `render` message sent from sandbox to the main per component, updating the `viewState` per `compId`

### problem 2 - serializing the mutable update revision

Mutable is based on a private symbol based property `object[Symbol('Revision')]` which is updated anytime the `object` is updated.

The full structure is 
```typescript
  Proxy --> Object
             Symbol('Revision'): number
```

When we serialize mutable, we should also serialize the `Symbol('Revision')` and update it on the target object to allow listeners
(to changes) to understand this object was updated. Best to update it to the same value as the original, which allows 
optimizations explained later.

mutable has other private Symbol based properties, which should not be serialized - namely, 
`Symbol.for("isProxy"), Symbol.for("listener"), Symbol.for("original"), Symbol.for("proxy")`

### problem 3 - with mutable, there is no point in serializing unchanged mutables. But how?

First, lets consider a simple composite object
```json5
{
  name: 'Joe', lastName: 'Smith', REVISION: 100,
  phone: {number:  '555-555-5555', intlCode: '+1', REVISITON: 101},
  address: {street:  '235 W 16st', city: 'NY', REVISITON: 102}
}
```

on update it may turn into (keep in mind that mutable, on update, updates the Revisions of all patent objects)
```json5
{
  name: 'Joe', lastName: 'Smith', REVISION: 111,
  phone: {number:  '999-999-9999', intlCode: '+10', REVISITON: 110},
  address: {street:  '235 W 16st', city: 'NY', REVISITON: 102}
}
```

The serialization engine can understand that given the last time it has sent the objects up to some revision, 
any object with a larger revision was changed, while any below was not. In this case, assume the serialization happed
at `REVISION === 105`, only the objects with revision `110` and `111` need to be serialized and sent.

**However** things start to be interesting once we have an Array - 

Any change to an object in array will inc the array Revision, so does any reordering of the array items.
At the same time, the optimization of not serializing items which did not change is the most significant one.

There is one thing working for us - items which has not change, have the same Revision before and after serialization.

If, 
1. on Serialization, we store the index and revision of the array items. 
2. On re-serialization, we only serialize items
   that have a new revision, and just send the position of existing items.
3. On deserialization, we create the object.
4. On re-deserialization, we reorder existing items and replace new items

we have an algorithm for serializing mutable arrays.

Building the algorithm
-----------

Assumptions and observations:
* `jay-runtime` does not keep internal references to ViewState. 
  (it keeps references only as last view from previous render to compare with). 
  It supports both mutable or immutable ViewState by using the comparison function `checkModified` from `jay-reactive`.
* An optimization of not serializing objects who did not change is mostly important for Arrays, at which child objects can
  change or move within the Array
* We also note that once we start optimizing (not sending all data for unchanged items), 
  the notion of unchanged has to include both the item revision itself but also it's location in the render tree.
  a simple example are two objects exchange (between two parent attributes or two locations in an Array),
  even if both objects have not changed themselves, their changing location requires doing the same change
  in the deserialized object. That change can be replacing them, or updating the existing object with the values of the other.
* We note that replacing objects in a ViewState tree is rare, except for Arrays.
* We note that the challenge is when an item is marked as unchanged but has moved, in which case sending it has unchanged is a mistake.
* If the algorithm only focuses on optimizing arrays, the algorithm is scoped for a single Array instance.

The main idea of supporting *unchanged optimization* is to identify when an item has not change and has not moved - which 
can be done locally (per object to be serialized) by creating the pairs `(prop/index, child revision)`.
1. if the child object was updated, the `child revision` will be different
2. if the child object has moved, the `prop/index` will be different
3. for arrays, we can find an object with the same `child revision` but for a different `index`, we know it moved

Lets build the algorithm - 

The algorithm for general serialization - 
1. using `replacer` for `JSON.stringify` we serialize the revision symbol value as a property, and for arrays also add an array indication.
   (why? because array regular notation of `[1,2,3,4]` does not play nice with another revision property, in which case we serialize an array as an object `{1: 1, 2:2, 3:3, 4:4}`)
2. serialization and re-serialization are the same.
3. on deserialization we revive the revision symbol value and use the array marker to create array instances when needed.
4. on re-deserialization we deserialize the new value, then update the mutable instance by selectively coping primitive values using a recursive function

The algorithm for arrays / objects with the optimization -
1. at serialization time for `object` or `array`, we stores on the mutable object a map of property / index to revision of child objects.
2. at re-serealization, for each `object`, for each `property`, if the revision has not change, we serialize `unchanged`
3. for each `array`, we create a map of revisions and compare object revisions to the previous object revisions. 
   1. for existing `revisions`, we serialize  `(index, previousIndex, unchanged)`
   2. for new `revisions`, we serialize `(index, object)`
4. on deserialization, for `objects`, we do not update when seeing `unchanged`
5. for `arrays`, we build a new the array according to the serialized representation, including updating the `array revision`. 