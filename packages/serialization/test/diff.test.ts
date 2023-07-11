import {describe, expect, it, jest, beforeEach} from '@jest/globals'
import {ArrayContexts, diff} from '../lib/serialize/diff'
import {ADD, MOVE, REMOVE, REPLACE} from "jay-mutable-contract";

describe('diff', () => {

    describe('new object', () => {
        it('should return ADD patch for a new object', () => {
            let patch = diff({a: 1, b: 2},undefined)
            expect(patch[0]).toEqual([
                {op: ADD, path: [], value: {a: 1, b: 2}}
            ])
        })
    })

    describe('atomic values', () => {
        it('should return empty patch for same value', () => {
            let patch = diff(1,1)
            expect(patch[0]).toEqual([])
        })

        it('should return replace patch different values', () => {
            let patch = diff(1,2)
            expect(patch[0]).toEqual([
                {op: REPLACE, path: [], value: 1}
            ])
        })
    })

    describe('objects values', () => {
        it("should return empty for equal objects", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5}},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([])
        })

        it("should return replace for top level property replacement", () => {
            let patch = diff(
                {a: 1, b: 4, c: {d: 4, e: 5}},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['b'], value: 4}
            ])
        })

        it("should return replace for deep property replacement", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 7, e: 5}},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['c', 'd'], value: 7}
            ])
        })

        it("should return add for new keys", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5}, f: 6},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([
                {op: ADD, path: ['f'], value: 6}
            ])
        })

        it("should return add for new deep keys", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5, f: 6}},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([
                {op: ADD, path: ['c', 'f'], value: 6}
            ])
        })

        it("should return remove for removed keys", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5}},
                {a: 1, b: 2, c: {d: 4, e: 5}, f: 6}
            )
            expect(patch[0]).toEqual([
                {op: REMOVE, path: ['f']}
            ])
        })

        it("should return remove for removed deep keys", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5}},
                {a: 1, b: 2, c: {d: 4, e: 5, f: 6}}
            )
            expect(patch[0]).toEqual([
                {op: REMOVE, path: ['c', 'f']}
            ])
        })

        it("should return replace object with primitive", () => {
            let patch = diff(
                {a: 1, b: 2, c: 4},
                {a: 1, b: 2, c: {d: 4, e: 5, f: 6}}
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['c'], value: 4}
            ])
        })

        it("should return replace primitive with object", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5, f: 6}},
                {a: 1, b: 2, c: 4}
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['c'], value: {d: 4, e: 5, f: 6}}
            ])
        })

        it("should return replace an object if more then 50% of it's properties has been modified", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 7, e: 8, f: 9}},
                {a: 1, b: 2, c: {d: 4, e: 5, f: 6}}
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['c'], value: {d: 7, e: 8, f: 9}}
            ])
        })

        it("should return replace an object if more then 50% of it's properties has been modified across multiple objects", () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 7, e: {x: 1, y: 4}, f: {x: 1, y: 4}}},
                {a: 1, b: 2, c: {d: 4, e: {x: 1, y: 2}, f: {x: 1, y: 2}}}
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['c'], value: {d: 7, e: {x: 1, y: 4}, f: {x: 1, y: 4}}}
            ])
        })
    });

    describe("primitive array values", () => {
        it("should return empty for the same array", () => {
            let patch = diff(
                [1,2,3],
                [1,2,3],
                []
            )
            expect(patch[0]).toEqual([])
        })

        it("should return patch for added item", () => {
            let patch = diff(
                [1,2,3, 4],
                [1,2,3],
                []
            )
            expect(patch[0]).toEqual([
                {op: ADD, path: ['3'], value: 4}]
            )
        })

        it("should return patch for removed item", () => {
            let patch = diff(
                [1,2,3],
                [1,2,3, 4],
                []
            )
            expect(patch[0]).toEqual([
                {op: REMOVE, path: ['3']}]
            )
        })

        it("should return patch for changed item", () => {
            let patch = diff(
                [1,2,3],
                [1,4,3],
                []
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: ['1'], value: 2}]
            )
        })

        it("should replace all the array if there is a large change", () => {
            let patch = diff(
                [1,2,3],
                [4,5,6],
                []
            )
            expect(patch[0]).toEqual([
                {op: REPLACE, path: [], value: [1,2,3]}]
            )
        })

        it("should return patch for changes in a nested array", () => {
            let patch = diff(
                {a: [1,2,3,5]},
                {a: [1,4,3]},
                []
            )
            expect(patch[0]).toEqual([
                {op: ADD, path: ['a', '3'], value: 5},
                {op: REPLACE, path: ['a', '1'], value: 2}
            ])
        })
    })

    describe('object array values', () => {

        describe('with an array context', () => {

            const TOP_LEVEL_ARRAY_CONTEXT: ArrayContexts = [[[], {lastArray: null, matchBy: 'id'}]];
            const NESTED_ARRAY_CONTEXT: ArrayContexts = [[['b'], {lastArray: null, matchBy: 'id'}]];
            it("should return empty for the same array with a context", () => {
                let patch = diff(
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                    TOP_LEVEL_ARRAY_CONTEXT
                )
                expect(patch[0]).toEqual([])
            })

            it("should return add patch for an added item", () => {
                let patch = diff(
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}, {id: 4, c:"4"}],
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                    TOP_LEVEL_ARRAY_CONTEXT
                )
                expect(patch[0]).toEqual([
                    {op: ADD, path: [3], value: {id: 4, c:"4"}}
                ])
            })

            it("should return remove patch for a removed item", () => {
                let patch = diff(
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}, {id: 4, c:"4"}],
                    TOP_LEVEL_ARRAY_CONTEXT
                )
                expect(patch[0]).toEqual([
                    {op: REMOVE, path: [3]}
                ])
            })

            it("should return move patch for a moved item", () => {
                let patch = diff(
                    [{id: 1, c:"1"}, {id: 3, c:"3"}, {id: 2, c:"2"}],
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                    TOP_LEVEL_ARRAY_CONTEXT
                )
                expect(patch[0]).toEqual([
                    {op: MOVE, path: [1], from: [2]}
                ])
            })

            it("should return a patch for object property update", () => {
                let patch = diff(
                    [{id: 1, c:"1"}, {id: 2, c:"4"}, {id: 3, c:"3"}],
                    [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                    TOP_LEVEL_ARRAY_CONTEXT
                )
                expect(patch[0]).toEqual([
                    {op: REPLACE, path: ['1', 'c'], value: "4"}
                ])
            })

            it("should return a composite array patch", () => {
                let patch = diff(
                    {a: 1, b: [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}, {id: 5, c:"5"}, {id: 7, c: "7"}, {id: 6, c:"6"}]},
                    {a: 1, b: [{id: 1, c:"1"}, {id: 3, c:"3"}, {id: 4, c:"4"}, {id: 2, c:"2"}, {id: 5, c:"5"}, {id: 6, c:"6"}]},
                    NESTED_ARRAY_CONTEXT
                )
                expect(patch[0]).toEqual([
                    {op: MOVE, from: ['b', 3], path: ['b', 1]},
                    {op: REMOVE, path: ['b', 3]},
                    {op: ADD, path: ['b', 4], value: {id: 7, c: "7"}}
                ])
            })

        })

        it("should return empty for the same array", () => {
            let patch = diff(
                [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                []
            )
            expect(patch[0]).toEqual([])
        })



    })

    describe('objects who calculate JSON Patch using `.getPatch()`', () => {
        it('should use `.getPatch()` of `newValue` if supported', () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5}, getPatch() {
                    return [{op: ADD, path: ['a', 'b', 'c'], value: 12}]
                    }},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([{op: ADD, path: ['a', 'b', 'c'], value: 12}])
        })

        it('should use `.getPatch()` of nested property of `newValue` if supported', () => {
            let patch = diff(
                {a: 1, b: 2, c: {d: 4, e: 5, getPatch() {
                            return [
                                {op: ADD, path: ['a', 'b', 'c'], value: 12},
                                {op: MOVE, path: ['a', 'x', '1'], from: ['a', 'x', '2']}
                            ]
                        }}},
                {a: 1, b: 2, c: {d: 4, e: 5}}
            )
            expect(patch[0]).toEqual([
                {op: ADD, path: ['c', 'a', 'b', 'c'], value: 12},
                {op: MOVE, path: ['c', 'a', 'x', '1'], from: ['c', 'a', 'x', '2']}
            ])
        })
    })
})