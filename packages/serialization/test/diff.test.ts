import {describe, expect, it, jest, beforeEach} from '@jest/globals'
import {ADD, diff, REMOVE, REPLACE} from '../lib/serialize/diff'

describe('diff', () => {
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
        it("should return empty for the same array", () => {
            let patch = diff(
                [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                []
            )
            expect(patch[0]).toEqual([])
        })

        it("should return empty for the same array with a context", () => {
            let patch = diff(
                [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}],
                [[[], {lastArray: null, matchBy: 'id'}]]
            )
            expect(patch[0]).toEqual([])
        })

        it("should return array diff", () => {
            let patch = diff(
                {a: 1, b: [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}]},
                {a: 1, b: [{id: 1, c:"1"}, {id: 3, c:"3"}, {id: 4, c:"4"}, {id: 2, c:"2"}]},
                [[['b'], {lastArray: null, matchBy: 'id'}]]
            )
            expect(patch[0]).toEqual([])
        })
    })
})