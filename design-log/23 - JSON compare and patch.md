# JSON Compare and Patch

Given the work in [Serialization Mutable](22%20-%20serialized%20mutable.md) it is clear we need algorithms for
computing the JSON Patch and applying the JSON Patch. We need those algorithms to be small (code wise), efficient
and such that we can extend with our specifics (`immer`, `jay mutable`, `list-compare`).

A good resource of available work is [jsonpatch](https://jsonpatch.com/).

## [json-joy](https://github.com/streamich/json-joy)

Very solid and well written library, yet not really browser ready. License is Apache 2.0.
Includes

- JSON patch apply algorithm
- great starter code for [json-equals](https://github.com/streamich/json-joy/tree/master/src/json-equal) which can be a base
  for comparing two JSON objects for a JSON patch
- serialization benchmarks in [json-pack](https://github.com/streamich/json-joy/tree/master/src/json-pack) from which we learn
  `JSON.stringify` and `JSON.parse` are great

## [jsonpatch.js](https://github.com/dharmafly/jsonpatch.js)

old library to just apply a patch on objects.

## [jsonpatch-js](http://bruth.github.io/jsonpatch-js/)

old library to just apply a patch on objects.
can also generate a function that given a patch, generates a function to apply it to objects.

## [jiff](https://github.com/cujojs/jiff)

old library, does both diff and patch. looks like solid and fast implementation. MIT license.
It does an `O(N^2)` array comparison algorithm by first serializing all array elements, then creating a comparison
matrix.

## [JSON-Patch](https://github.com/Starcounter-Jack/JSON-Patch)

recently active, MIT.
Does diff and patch.

It has a solid compare algorithm at [duplex.ts](https://github.com/Starcounter-Jack/JSON-Patch/blob/master/src/duplex.ts#L143),
which does not take into account moved array items.

## [JSON8](https://github.com/sonnyp/JSON8)

has the [patch](https://github.com/sonnyp/JSON8/tree/main/packages/patch) library, which is a bit old, ISC license.
Very efficient and concise diff and apply algorithm, not compliant to JSON-patch, does not take into account moved array items

## [mutant-json](https://github.com/rubeniskov/mutant-json)

Only applies patches. 3 years old, MIT license

## [immutable-json-patch](https://github.com/josdejong/immutable-json-patch)

active. Only applies patches. ISC license.

## [rfc6902](https://github.com/chbrown/rfc6902)

MIT license, does both diff and patch.
has an interesting dynamic programming diff algorithm. However, the algorithm does not do move operations.
Instead, it does work to optimize for small insert / remove operations of items, making it a good candidate algorithm.

has also a good apply algorithm which updates in place

**Candidate algorithm**

**NO** - simple validation on a 100x100 matrix with 100 updates shows seconds of runtime!!!
see [/exploration/rfc6902](../exploration/rfc6902)

## [immer](https://github.com/immerjs/immer)

Immer has a json patch algorithm that is not decoupled from immer, can only be used as part of immer.
The algorithm does a comparison between objects that does not handle array added, removed or moved items.
