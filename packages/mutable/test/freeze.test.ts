import {describe, expect, it, jest} from '@jest/globals'
import {mutableObject} from "../lib";
import {_mutableObject, MUTABLE_PROXY_SYMBOL} from "../lib/mutable"
import {checkModified, getRevision} from "jay-reactive";
import {ADD, isMutable, JSONPatchReplace, MOVE, REMOVE, REPLACE} from "jay-mutable-contract";

describe('freeze', () => {

    describe('objects', () => {
        it('should return a frozen copy', () => {
            let mutable = mutableObject({a: 1, b: 2})
            let frozen = mutable.freeze();
            expect(frozen).toEqual(mutable);
            expect(Object.isFrozen(frozen)).toBeTruthy();
        })

        it('given a prop update, should return a new frozen copy', () => {
            let mutable = mutableObject({a: 1, b:2});
            let frozen: any = mutable.freeze();

            mutable.a = 3
            let frozen2: any = mutable.freeze();

            expect(frozen.a).toEqual(1)
            expect(frozen2.a).toEqual(3)
            expect(frozen2).toEqual(mutable);
            expect(frozen2).not.toEqual(frozen);
        })

        it('support new property', () => {
            let mutable: any = mutableObject({a: 1, b:2});

            mutable.c = 3
            let frozen: any = mutable.freeze();

            expect(frozen.c).toBe(3)
            expect(frozen).toEqual(mutable);
        })

        it('support removed property', () => {
            let mutable = mutableObject({a: 1, b:2});

            delete mutable.a
            let frozen: any = mutable.freeze();

            expect(frozen.a).toBeUndefined()
            expect(frozen).toEqual(mutable);
        })
    })

    describe('arrays', () => {
        it('should return a frozen copy', () => {
            let mutable = mutableObject([1,2,3])
            let frozen = mutable.freeze();
            expect(frozen).toEqual(mutable);
            expect(Object.isFrozen(frozen)).toBeTruthy();
        })

        it('given an update, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3])
            let frozen = mutableArr.freeze();

            mutableArr[1] = 4
            let frozen2 = mutableArr.freeze();

            expect(frozen[1]).toEqual(2)
            expect(frozen2[1]).toEqual(4)
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given copyWithin, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3,4,5,6,7,8])
            let frozen = mutableArr.freeze();

            mutableArr.copyWithin(0, 5, 8);
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([1,2,3,4,5,6,7,8])
            expect(frozen2).toEqual([6,7,8,4,5,6,7,8])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given fill, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3,4,5,6,7])
            let frozen = mutableArr.freeze();

            mutableArr.fill(0, 2, 5)
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([1,2,3,4,5,6,7])
            expect(frozen2).toEqual([1,2,0,0,0,6,7])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given pop, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3])
            let frozen = mutableArr.freeze();

            mutableArr.pop()
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([1,2,3])
            expect(frozen2).toEqual([1,2])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given push, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3])
            let frozen = mutableArr.freeze();

            mutableArr.push(4,5)
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([1,2,3])
            expect(frozen2).toEqual([1,2,3,4,5])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given shift, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3])
            let frozen = mutableArr.freeze();

            mutableArr.shift()
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([1,2,3])
            expect(frozen2).toEqual([2,3])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given sort, should return a new frozen copy', () => {
            let mutableArr = mutableObject([2,4,3,1])
            let frozen = mutableArr.freeze();

            mutableArr.sort()
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([2,4,3,1])
            expect(frozen2).toEqual([1,2,3,4])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        describe('should support JSON patch for splice', () => {
            it('given splice removed items, should return a new frozen copy', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8])
                let frozen = mutableArr.freeze();

                mutableArr.splice(2, 3);
                let frozen2 = mutableArr.freeze();

                expect(frozen).toEqual([1,2,3,4,5,6,7,8])
                expect(frozen2).toEqual([1,2,6,7,8])
                expect(frozen2).toEqual(mutableArr);
                expect(frozen2).not.toEqual(frozen);
            })

            it('given splice added items, should return a new frozen copy', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8])
                let frozen = mutableArr.freeze();

                mutableArr.splice(2, 0, 10, 11);
                let frozen2 = mutableArr.freeze();

                expect(frozen).toEqual([1,2,3,4,5,6,7,8])
                expect(frozen2).toEqual([1,2,10,11,3,4,5,6,7,8])
                expect(frozen2).toEqual(mutableArr);
                expect(frozen2).not.toEqual(frozen);
            })

            it('given splice added and remove items, should return a new frozen copy', () => {
                let mutableArr = mutableObject([1,2,3,4,5,6,7,8])
                let frozen = mutableArr.freeze();

                mutableArr.splice(2, 2, 10, 11, 12);
                let frozen2 = mutableArr.freeze();

                expect(frozen).toEqual([1,2,3,4,5,6,7,8])
                expect(frozen2).toEqual([1,2,10,11,12,5,6,7,8])
                expect(frozen2).toEqual(mutableArr);
                expect(frozen2).not.toEqual(frozen);
            })
        })

        it('given reverse, should return a new frozen copy', () => {
            let mutableArr = mutableObject([2,4,3,1])
            let frozen = mutableArr.freeze();

            mutableArr.reverse()
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([2,4,3,1])
            expect(frozen2).toEqual([1,3,4,2])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })

        it('given unshift, should return a new frozen copy', () => {
            let mutableArr = mutableObject([1,2,3])
            let frozen = mutableArr.freeze();

            mutableArr.unshift(4,5,6)
            let frozen2 = mutableArr.freeze();

            expect(frozen).toEqual([1,2,3])
            expect(frozen2).toEqual([4,5,6,1,2,3])
            expect(frozen2).toEqual(mutableArr);
            expect(frozen2).not.toEqual(frozen);
        })
    })

    describe('nested objects and arrays', () => {
        it('should return the same frozen object on two calls without modifications', () => {
            let mutable = mutableObject({a: 1, b:2});

            let frozen: any = mutable.freeze();
            let frozen2: any = mutable.freeze();

            expect(frozen).toBe(frozen2);
        })

        it('should return the same frozen object on two calls without modifications after updates', () => {
            let mutable = mutableObject({a: 1, b:2});

            mutable.a = 3;
            let frozen: any = mutable.freeze();
            let frozen2: any = mutable.freeze();

            expect(frozen).toBe(frozen2);
        })

        it("should freeze nested objects", () => {
            let mutable = mutableObject({a: 1, b: 2, c: {d: 4, e: 5}, d: {d: 6, e: 7}})
            let frozen: any = mutable.freeze();

            expect(Object.isFrozen(frozen)).toBeTruthy();
            expect(Object.isFrozen(frozen.c)).toBeTruthy();
            expect(Object.isFrozen(frozen.d)).toBeTruthy();
        })

        it("only refreeze changed objects and their parents in nested objects structure", () => {
            let mutable = mutableObject({a: 1, b: 2, c: {d: 4, e: 5}, d: {d: 6, e: 7}})
            let frozen: any = mutable.freeze();

            mutable.c.d = 14;
            let frozen2: any = mutable.freeze();

            expect(frozen).not.toBe(frozen2)
            expect(frozen.c).not.toBe(frozen2.c)
            expect(frozen.d).toBe(frozen2.d)
        })

        it("should freeze array nested objects", () => {
            let mutable = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}])
            let frozen: any = mutable.freeze();

            expect(Object.isFrozen(frozen)).toBeTruthy();
            for (let item of frozen)
                expect(Object.isFrozen(item)).toBeTruthy();
        })

        it("only refreeze changed objects and their parents in nested object and array structure", () => {
            let mutable = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}])
            let frozen: any = mutable.freeze();

            mutable[1].a = 13;
            let frozen2: any = mutable.freeze();

            expect(frozen).not.toBe(frozen2)
            expect(frozen[0]).toBe(frozen2[0])
            expect(frozen[1]).not.toBe(frozen2[1])
            expect(frozen[2]).toBe(frozen2[2])
        })

        it("should not refreeze moved objects", () => {
            let mutable = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}])
            let frozen: any = mutable.freeze();

            let item = mutable.pop()
            mutable.unshift(item)
            let frozen2: any = mutable.freeze();

            expect(frozen).not.toBe(frozen2)
            expect(frozen[0]).toBe(frozen2[1])
            expect(frozen[1]).toBe(frozen2[2])
            expect(frozen[2]).toBe(frozen2[0])
        })
    })

    describe("update mutable with a frozen object ", () => {
        it("should create a mutable copy", () => {
            let mutable = mutableObject({a: 1, b: 2, c: {d:4, e: 5}})
            mutable.c = Object.freeze({d:7, e: 8})
            mutable.c.d = 9
            expect(mutable).toEqual({a:1, b: 2, c: {d: 9, e: 8}})
        })
    })
})
