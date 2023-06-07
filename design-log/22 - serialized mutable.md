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
