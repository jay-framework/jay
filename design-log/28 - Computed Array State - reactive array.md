# Computed Array State / Reactive Array

Jay is using immutable data by design. Immutable data is great for performance, yet when using computed arrays 
it creates a challenge.

Consider a state of an array nature (can be flat or nested array)

for example, consider an array of objects `one`, `two` and `three`
```typescript
const [getArr, setArr] = createState([one, two, three])
```

When we update an item in the array (say, update `two` to `two2`, we also replace the array, and preserve the previous items
```typescript
setArr([...getArr().slice(0,0), two2, ...getArr().slice(1)])
```
after this update, the new array, the new state, has the item `one`, `two2` and `three`.

## The problem

When we are using `array.map`, especially with `createMemo`, we create new instances. 

```typescript
const derivedArray = createMemo(() => getArr().map(item => ({...item, someProp: newValue})))
```

on the first creation of the state and memo, the above `getArr().map()` is called for each item and creates mapped item instances.
On the second update of the array, by default, it will run the map again for all items, as we have a new array.

Can we make the above only run the callback for items that have changed? 
e.g. only for item `two` who changed to `two2`.

# Defining `createDerivedArray` construct

The `createDerivedArray` is intended to solve the above problem. The signature is based on the `map` signature, with some additions
```typescript
declare function createDerivedArray<T, U>(arrayGetter: Getter<T[]>, 
                                          mapCallback: (item: Getter<T>, index: Getter<number>, length: Getter<number>) => U): U[] 
```

The parameters are
* `arrayGetter` - a getter that returns an array as the source of the map
* `mapCallback` - the callback function to be called for each item. It receives the following parameters and should return the mapped instance
  * `item` - the item to map over
  * `index` - the index of the item in the array
  * `length` - the length of the array

The function will call the `mapCallback` with the following rules
1. on initial call - call map for all items of the array
2. if the array has changed - call map for any item that has changed
3. if an item position has changed, and the map function is using the index, call the map for that item
4. if the array has changed with different length yet the item has not, if the map function is using the array length, call the map again
5. if another dependency used by the map function is changed, all the item will be recomputed

The gist of the logic is 
```typescript
let mappedItemsCache = new Map<T, S>()
const mapper = <T, S>(mapCallback: (t: T, index: number, length: number) => S) => (item: T, index: number, array: Array[T]): S => {
if (dependencies changed  )
    rerun all;
  if (mappedItemsCache.has(item) && item.index !== index)
    return mappedItemsCache.get(item);
  let a = mapCallback(item, index, array.length);
  mappedItemsCache.set(item, a)
  return a;
}
```

The above code does not handle two specific cases - what if the `index` or `length` has changed? 
what if the `mapCallback` function is dependant on another state?
With both of those cases, we should reevaluate all the items, basically clearing the `mappedItemsCache`.







