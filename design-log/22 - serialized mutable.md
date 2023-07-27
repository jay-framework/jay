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


Update
====

Seems that this algorithm includes double copy of objects - once to mutate the objects, transforming arrays to objects 
and adding the revision, then serializing the transformed objects.

Not Working!

So now, we are looking for alternatives that are more effective serialization. 
We keep in mind the process we have -

![Diagram](22%20-%20serialized%20mutable%20flow.svg)

We need to make all the process performant
* `Array` - can be mutable or immutable. 

  `immer` does a great job at creating a new immutable array that can then be serialized.
  
  `jay mutable` does a great job at updating the mutable array and tracking which object changed
* `serialized` - can be full object serialization or a patch (only serialize what has changed)
  
  `immer` and most similar json diff algorithms are great for value updates, but fail on array `unshift` with a very
  inefficient diff **see note 1 below**

  `jay mutable` serialization is challenging because the revision number serialization requires that we transform array 
  into another representation **see note 2 below**. Still, it is a form of a patch based serialization.

* `revived array` - the array we get after serialization. 

  default serialization of the whole object results in an all new object, which is missing all the `===` optimizations
  in the `jay-runtime` package.

  patch based serialization works as objects who have not been changed remain as sub-trees of the new patched object

* `diff against previous DOM` - the algorithm is at [list-compare](../packages/list-compare/lib/list-compare.ts)
  It is a type of a patch algorithm that takes into account the `track-by` / `key` as objects ids, and calculates the
  minimal mutation from the previous status to the current array status.

  Given a patch, we can optimize this algorithm to use the patch instructions. 
  However, it is fast until about 10,000 Array items, so no real need to make the optimization


#### Note 1 - optimizing json diff
the problem with json diff is that given two `array`s, without any additional knowledge, to figure out if an item was 
pushed to the front, we have to do a `===` comparison between the array items, which is `O(n^2)` complexity.

```typescript
for (let a = 0; a < A.length; a++) {
    for (let b = 0; b < A.length; b++) {
        if (A[a] === B[b])
            // compute the diff    
    }    
}
```

However, we can create an algorithm focused on small changes that has complexity `O(n)` with a cutoff. 
The algorithm makes the assumption that *small* changes can be found fast and require small number of mutations to describe.
The cutoff is set at `let limit = log(min(A.length, B.length))` and the algorithm has complexity `O(limit^2) ~ O(n)`

The algorithm - 
```typescript
let limit = log(min(A.length, B.length));
let a=0, b=0;
mainLoop: while (a < A.length && b < B.length) {
    if (A(a) === B(b)) {
        a += 1;
        b += 1
    }
    continue;
    for (let seekSize = 1; seekSize < limit; seekSize++) {
        for (let index = 1; index <= seekSize; index++) {
            if (A[a+index] === B[b+seekSize-index])
                // we have a match, the elements from A between (a..a+index) and replace them with the items from B between (b..b+seekSize-index)
            continue mainLoop;    
        }
    }
    // revert to direct comparison of attributes json diff model (the standard model used by all other algorithms)
}
```

#### Note 1.1 - update on Immer

Reading the Immer source again, I can see that for objects there is the `state.assigned_` member which marks which object 
properties have been updated or deleted.

We can extend the idea for `array`s to also include `added` and `removed` `array` items, those making the above algorithm 
redundant and making for a simpler solution.

#### Note 2 - optimizing serialization of mutable

The problem with mutable serialization is the requirement to serialize the `revnum`.

however, if we drop this requirement, can we turn mutable serialization into a json diff like structure?

We note that mutable `revnum` is per object, and if an object was updated after the last serialization, it's `revnum` will be higher.
however, mutable updates the `revnum` of parent objects as well and does not track fine grained attribute changes, only tracking the fact
the parent object was modified.

Still, mutable does know, at the mutation time what has changed, and can generate a json diff instruction on the spot.
The advantage of this method is that `array.splice(4,2, {...}, {...}, {...})` turns almost trivially into two json diff `delete` instructions 
and three json diff `add` instructions.

Then, we can serialize the json diff generated from mutable. 
Applying the json diff on deserialization on another mutable will update the `revnum` allowing runtime to work in an optimal way 
on the mutated mutable. Still, the `revnum` of the same object across contexts will be different, but we are not sure it is significant.

#### Note 3 - Style difference

Given the above, the performance of using immer or jay mutable will be small. However, there is still a bit of style difference

With immer, a todo item change will look like

```typescript
let [todo, setTodo] = createState([...])

refs.done.onclick(({viewState: item}) => {
    setTodo(produce(todo(), draft => draft.find(_.id === item.id).done = !item.done))
})
```

With mutable, a todo item change will look like

```typescript
let [todo, setTodo] = createMutableState([...])

refs.done.onclick(({viewState: item}) => {
    item.todo = !item.todo
})
```

# The New Plan

The new plan is to have different solutions on main and sandbox. We support immer, mutable and immutable objects, each 
with a different algorithm. We will make both immer and mutable (on the sandbox side) into optional packages.

On the main side, we will use mutable in any case as it is the most optimized

![Diagram](22%20-%20serialized%20mutable%20flow%202.svg)

Sandbox:
* `Immer` can create JSON Patch, which we can serialize. It has sub-optimal JSON Patch for arrays changes, 
  but it can improved by the Immer project later 
* `jay-mutable` can track assignments and create JSON Patch.
* `Immutable` objects can generate JSON Patch, taking into account an algorithm similar to note 1 above.
  Another alternative with Immutable object is to take the [list-compare](../packages/list-compare/lib/list-compare.ts) algorithm
  from Runtime, and using the `jay-compiler` provide the path to arrays and key to the algorithm, to generate optimal 
  JSON Diff for the specific array and specific array usage in the view state.

Main:
* `jay-mutable` tracks assignments using the `revnum` attribute. Applying a patch to a `jay-mutable` object will increase the `revnum`,
  causing optimal rendering by `jay-runtime` based only on changed `revnum` or new array items.
* A potential optimization is to skip the [list-compare](../packages/list-compare/lib/list-compare.ts) algorithm for arrays, 
  given the quality of the JSON patch is good enough.

# Update - Failure to create JSON Patch from Mutable

To summarize the failure - see this test
```typescript
            it('should preserve temporal order for array and nested objects', () => {
  let obj = mutableObject([
    {a: 1, b: 2},
    {a: 3, b: 4},
    {a: 5, b: 6}
  ], true);
  obj[2].a = 13
  obj[0].a = 11
  obj.splice(1, 0, {a: 7, b: 8})
  obj[1].a = 17
  expect(obj.getPatch()).toEqual([
    {op: REPLACE, path: ["2", "a"], value: 13},
    {op: REPLACE, path: ["0", "a"], value: 11},
    {op: ADD, path: ["1"], value: {a: 7, b: 8}},
    {op: REPLACE, path: ["1", "a"], value: 17}
  ])
})
```

The test fails with the first patch operation as `{"op": "replace", "path": ["3","a"], "value": 13}` instead 
of `{"op": "replace", "path": ["2","a"], "value": 13}`. Note the path `3` instead of `2`. 

This is happening because when we did the update `obj[2].a = 13`, the updated item was at index `2`. 
However, by the time we extracted the patch using `obj.getPatch()` the item has moved to index `3` because of the `obj.splice(1, 0, {a: 7, b: 8})`.

The source of the problem is that the `getPatch()` function constructs the path at the time it is called, which is wrong. 
We also note that we cannot know that at the time of the update, our object was at index `2` - the object itself is not aware of it's index within 
the parent array. What if we have the item in multiple arrays, using for instance `array.filter`? what is the index of the item in this case? 

We also cannot use the access pattern and store the index `2` someplace, because it assumes a lot - 
for instance, doing the following will break
```typescript
let tmp = obj[2];
obj.splice(1, 0, {a: 7, b: 8})
tmp.a = 13
```
now, the update should be `{"op": "replace", "path": ["3","a"], "value": 13}` but using the access pattern will get us index `2`.

The only option that works correctly is that at the time of applying a change to a mutable object, the mutable will call parent objects 
(potentially multiple parents, like with `trackChanges`) passing the json patch operation. Each parent will have to search for the source object within 
it's child properties or indexes and append to the path. However, this is a `O(N*M)` operation per mutable object change 
(N - number of indexes / properties, M - depth of the mutable tree).

As a side note, another problem is that `Array` APIs do not have the notion of moving elements. 
To move elements in an array, we need to call two different `Array` APIs, like

```typescript
let items = array.splice(rand, 1);
array.splice(rand2, 0, ...items);
```

to generate a `MOVE` JSON Patch operation, we need to make assumptions and replace two subsequent `REMOVE` and `ADD` operations into one `MOVE`.

summary - 

**We cannot create a JSON Patch from a mutable object by recording changes**

Time for a new plan.

# The New New Plan

Given `Mutable` cannot create JSON Patch, and given `Immer` JSON patch generation is sub-optimal, we consolidate to the following 
pattern

![Diagram](22%20-%20serialized%20mutable%20flow%203.svg)

the new plan is to materialize a mutable object into an immutable frozen object, which is then diffed with the 
previous version and serialized as a JSON Patch.

It also raises the question should on the other side of deserialization we use mutable or immutable objects?

# Another update
comparing mutable and immutable deserialization, (see [deserialization-benchmark](../exploration/deserialization-benchmark))
it is clear that `immutable` is way faster compared to `mutable`

and example of the output on my mac pro on node.js - 
```
mutable (avg of 1000 runs):   1.455638417005539
immutable (avg of 1000 runs): 0.054917582988739014
mutable (avg of 1000 runs):   1.3774844170212746
immutable (avg of 1000 runs): 0.05344700002670288
mutable (avg of 1000 runs):   1.3876245409846306
immutable (avg of 1000 runs): 0.052621833980083466
mutable (avg of 1000 runs):   1.409355624973774
immutable (avg of 1000 runs): 0.04785041695833206
mutable (avg of 1000 runs):   1.3800874159932137
immutable (avg of 1000 runs): 0.04846541601419449
mutable (avg of 1000 runs):   1.375096333026886
immutable (avg of 1000 runs): 0.0486883749961853
mutable (avg of 1000 runs):   1.4298095830082893
immutable (avg of 1000 runs): 0.05050541698932648
mutable (avg of 1000 runs):   1.3853110830187798
immutable (avg of 1000 runs): 0.047022374987602235
mutable (avg of 1000 runs):   1.3960099170207978
immutable (avg of 1000 runs): 0.04937041699886322
mutable (avg of 1000 runs):   1.4480939999818803
immutable (avg of 1000 runs): 0.06387054097652435
```

same benchmark in chrome - 
```
mutable (avg of 1000 runs):   1.1126999999955296
index.js:304 immutable (avg of 1000 runs): 0.15619999999552966
index.js:286 mutable (avg of 1000 runs):   1.1189000000059606
index.js:304 immutable (avg of 1000 runs): 0.1538999999985099
index.js:286 mutable (avg of 1000 runs):   1.1157000000029802
index.js:304 immutable (avg of 1000 runs): 0.15510000000149013
index.js:286 mutable (avg of 1000 runs):   1.0897999999970198
index.js:304 immutable (avg of 1000 runs): 0.1545
index.js:286 mutable (avg of 1000 runs):   1.14760000000149
index.js:304 immutable (avg of 1000 runs): 0.1545
index.js:286 mutable (avg of 1000 runs):   1.0888999999985098
index.js:304 immutable (avg of 1000 runs): 0.15479999999701977
index.js:286 mutable (avg of 1000 runs):   1.0925
index.js:304 immutable (avg of 1000 runs): 0.1538999999985099
index.js:286 mutable (avg of 1000 runs):   1.0886000000014902
index.js:304 immutable (avg of 1000 runs): 0.15460000000149013
index.js:286 mutable (avg of 1000 runs):   1.0992999999970197
index.js:304 immutable (avg of 1000 runs): 0.1553999999985099
index.js:286 mutable (avg of 1000 runs):   1.09439999999851
index.js:304 immutable (avg of 1000 runs): 0.21320000000298023
```

we can see performance advantage of `x3` on node.js and `x6` on browser
for the immutable option.