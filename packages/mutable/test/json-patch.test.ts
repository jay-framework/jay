import {describe, expect, it, jest} from '@jest/globals'
import {mutableObject} from "../lib";
import {_mutableObject, MUTABLE_PROXY_SYMBOL} from "../lib/mutable"
import {checkModified, getRevision} from "jay-reactive";
import {ADD, isMutable, JSONPatchReplace, MOVE, REMOVE, REPLACE} from "jay-mutable-contract";

describe('JSON Patch', () => {

    describe('for objects', () => {
        it('should make replace JSONPatch for replaced property', () => {
            let mutable = mutableObject({a: 1, b:2}, true);

            mutable.a = 3
            expect(mutable.getPatch()).toEqual([{op: REPLACE, path: ['a'], value: 3}])
        })

        it('should make add JSONPatch for new  property', () => {
            let mutable: any = mutableObject({a: 1, b:2}, true);

            mutable.c = 3
            expect(mutable.getPatch()).toEqual([{op: ADD, path: ['c'], value: 3}])
        })

        it('should make remove JSONPatch for removed property', () => {
            let mutable = mutableObject({a: 1, b:2}, true);

            delete mutable.a
            expect(mutable.getPatch()).toEqual([{op: REMOVE, path: ['a']}])
        })
    })

    describe('for arrays', () => {
        it('should support JSON patch for setting an array element', () => {
            let mutableArr = mutableObject([1,2,3], true);
            mutableArr[1] = 4
            expect(mutableArr.getPatch()).toEqual([{op: REPLACE, path: ["1"], value: 4}])
        })

        it('should support JSON patch for copyWithin', () => {
            let mutableArr = mutableObject([1,2,3,4,5,6,7,8], true);
            mutableArr.copyWithin(0, 5, 8);
            expect(mutableArr.getPatch()).toEqual([
                {op: REPLACE, path: ["0"], value: 6},
                {op: REPLACE, path: ["1"], value: 7},
                {op: REPLACE, path: ["2"], value: 8}
            ])
        })

        it('should support JSON patch for fill', () => {
            let mutableArr = mutableObject([1,2,3,4,5,6,7], true);
            mutableArr.fill(0, 2, 5)
            expect(mutableArr.getPatch()).toEqual([
                {op: REPLACE, path: ["2"], value: 0},
                {op: REPLACE, path: ["3"], value: 0},
                {op: REPLACE, path: ["4"], value: 0}
            ])
        })

        it('should support JSON patch for pop', () => {
            let mutableArr = mutableObject([1,2,3], true);
            mutableArr.pop()
            expect(mutableArr.getPatch()).toEqual([{op: REMOVE, path: ["2"]}])
        })

        it('should support JSON patch for push', () => {
            let mutableArr = mutableObject([1,2,3], true);
            mutableArr.push(4,5)
            expect(mutableArr.getPatch()).toEqual([
                {op: ADD, path: ["3"], value: 4},
                {op: ADD, path: ["4"], value: 5}
            ])
        })

        it('should support JSON patch for shift', () => {
            let mutableArr = mutableObject([1,2,3], true);
            mutableArr.shift()
            expect(mutableArr.getPatch()).toEqual([{op: REMOVE, path: ["0"]}])
        })

        // optimal sort patch requires doing another sort algorithm, and it makes no sense to
        // repeat an O(N log N) with another O(N log N) or even O(N^2) algorithm.
        it.skip('should support JSON patch for sort', () => {
            let mutableArr = mutableObject([6,5,4,1,2,3], true);
            mutableArr.sort()
            expect(mutableArr.getPatch()).toEqual([
                {op: MOVE, path: ["0"], from: ["3"], value: 1},
                {op: MOVE, path: ["1"], from: ["4"], value: 2},
                {op: MOVE, path: ["2"], from: ["5"], value: 3},
                {op: MOVE, path: ["3"], from: ["2"], value: 4},
                {op: MOVE, path: ["4"], from: ["1"], value: 5},
                {op: MOVE, path: ["5"], from: ["0"], value: 6}
            ])
        })

        describe('should support JSON patch for splice', () => {
            it('remove items', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8], true);
                let removedItems = mutableArr.splice(2, 3);
                expect(mutableArr.getPatch()).toEqual([
                    {op: REMOVE, path: ["2"]},
                    {op: REMOVE, path: ["3"]},
                    {op: REMOVE, path: ["4"]}
                ])
                expect(removedItems).toEqual([3,4,5])
            })

            it('add items', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8], true);
                mutableArr.splice(2, 0, 10, 11);
                expect(mutableArr.getPatch()).toEqual([
                    {op: ADD, path: ["2"], value: 10},
                    {op: ADD, path: ["3"], value: 11}
                ])
            })

            it('remove item < add items', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8], true);
                mutableArr.splice(2, 2, 10, 11, 12);
                expect(mutableArr.getPatch()).toEqual([
                    {op: REPLACE, path: ["2"], value: 10},
                    {op: REPLACE, path: ["3"], value: 11},
                    {op: ADD, path: ["4"], value: 12}
                ])
            })

            it('remove item > add items', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8], true);
                mutableArr.splice(2, 3, 10, 11);
                expect(mutableArr.getPatch()).toEqual([
                    {op: REPLACE, path: ["2"], value: 10},
                    {op: REPLACE, path: ["3"], value: 11},
                    {op: REMOVE, path: ["4"]}
                ])
            })
        })

        it('should support JSON patch for reverse', () => {
            let mutableArr = mutableObject([1,2,3], true);
            mutableArr.reverse()
            expect(mutableArr.getPatch()).toEqual([
                {op: MOVE, path: ["0"], from: ["2"]},
                {op: MOVE, path: ["1"], from: ["2"]}
            ])
        })
        it('should support JSON patch for unshift', () => {
            let mutableArr = mutableObject([1,2,3], true);
            mutableArr.unshift(4,5,6)
            expect(mutableArr.getPatch()).toEqual([
                {op: ADD, path: ["0"], value: 4},
                {op: ADD, path: ["1"], value: 5},
                {op: ADD, path: ["2"], value: 6},
            ])
        })
    })

    describe('general aspects', () => {
        it('should clear the patch after retrieval using `getPatch`', () => {
            let mutable = mutableObject({a: 1, b:2}, true);

            mutable.a = 3
            expect(mutable.getPatch()).toEqual([{op: REPLACE, path: ['a'], value: 3}])
            expect(mutable.getPatch()).toEqual([])
        })

        it('should support patch of nested objects', () => {
            let mutable = mutableObject({a: 1, b:2, c: {d: 4, e: [5,6,7]}}, true);

            mutable.a = 12
            mutable.c.d = 13
            mutable.c.e.push(14)
            expect(mutable.getPatch()).toEqual([
                {op: REPLACE, path: ['a'], value: 12},
                {op: REPLACE, path: ['c', 'd'], value: 13},
                {op: ADD, path: ['c', 'e', '3'], value: 14}
            ])
        })

        it('should clear the patch after retrieval for nested objects', () => {
            let mutable = mutableObject({a: 1, b:2, c: {d: 4, e: [5,6,7]}}, true);

            mutable.a = 12
            mutable.c.d = 13
            mutable.c.e.push(14)
            expect(mutable.getPatch()).toEqual([
                {op: REPLACE, path: ['a'], value: 12},
                {op: REPLACE, path: ['c', 'd'], value: 13},
                {op: ADD, path: ['c', 'e', '3'], value: 14}
            ])
            expect(mutable.getPatch()).toEqual([])
        })

        it("should have .getPatch function for mutables who are making JSON Patch", () => {
            let mutable = mutableObject({a: 1, b:2}, true);
            expect(mutable.getPatch).toBeDefined()
        })

        it("should not have .getPatch function for mutables who are making JSON Patch", () => {
            let mutable = mutableObject({a: 1, b:2});
            expect(mutable.getPatch).not.toBeDefined()
        })

        it('should create JSON Patch that does not include mutable instances', () => {
            let mutable = mutableObject({a: 1, b: {c: 1, d: 2}}, true);

            mutable.b = {c: 3, d: 4}
            mutable.b.c = 5;
            let patch = mutable.getPatch();
            for (let patchOp of patch) {
                let replacementValue = (patchOp as JSONPatchReplace).value;
                expect(isMutable(replacementValue)).toBe(false);
                expect(replacementValue[MUTABLE_PROXY_SYMBOL]).toBeUndefined()
            }
        })

        it('should create JSON Patch that does not include mutable instances 2', () => {
            let mutable = mutableObject(
                {a: 1, b: [
                        {c: 1, d: 2},
                        {c: 3, d: 4},
                        {c: 5, d: 6}
                    ]}, true);

            mutable.b.push({c: 7, d: 8})
            mutable.b[2].c = 12;
            let patch = mutable.getPatch();
            for (let patchOp of patch) {
                let replacementValue = (patchOp as JSONPatchReplace).value;
                expect(isMutable(replacementValue)).toBe(false);
                expect(replacementValue[MUTABLE_PROXY_SYMBOL]).toBeUndefined()
            }
        })

        describe('temporal ordering of patches', () => {
            it('should preserve temporal order for object and nested object', () => {
                let obj = mutableObject({
                    a: 12,
                    b: [1,2,3],
                    c: 22
                }, true);
                obj.a = 13;
                obj.b[1] = 4;
                obj.c = 23
                expect(obj.getPatch()).toEqual([
                    {op: REPLACE, path: ["a"], value: 13},
                    {op: REPLACE, path: ["b", "1"], value: 4},
                    {op: REPLACE, path: ["c"], value: 23}
                ])
            })

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
        })
    })
})
