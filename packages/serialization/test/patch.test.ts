import {describe, expect, it} from '@jest/globals'
import {mutableObject} from "jay-mutable";
import {patch} from "../lib/deserialize/patch";
import {ADD, MOVE, REMOVE, REPLACE} from "../lib/types";

describe('apply JSON patch', () => {
    describe("flat object", () => {
        it('should apply a replace patch', () => {
            let obj = mutableObject({a: 1, b: 2, c:3})
            patch(obj, [
                {op: REPLACE, path: ['b'], value: 4},
                {op: REPLACE, path: ['c'], value: 5}
            ])
            expect(obj).toEqual({a: 1, b: 4, c: 5});
        })

        it('should apply an add patch', () => {
            let obj = mutableObject({a: 1, b: 2, c:3})
            patch(obj, [
                {op: ADD, path: ['d'], value: 4}
            ])
            expect(obj).toEqual({a: 1, b: 2, c: 3, d: 4});
        })

        it('should apply a remove patch', () => {
            let obj = mutableObject({a: 1, b: 2, c:3})
            patch(obj, [
                {op: REMOVE, path: ['c']}
            ])
            expect(obj).toEqual({a: 1, b: 2});
        })
    })

    describe("nested object", () => {
        it('should apply a replace patch', () => {
            let obj = mutableObject({x: {a: 1, b: 2, c:3}})
            patch(obj, [
                {op: REPLACE, path: ['x', 'b'], value: 4},
                {op: REPLACE, path: ['x', 'c'], value: 5}
            ])
            expect(obj).toEqual({x: {a: 1, b: 4, c: 5}});
        })

        it('should apply an add patch', () => {
            let obj = mutableObject({x: {a: 1, b: 2, c:3}})
            patch(obj, [
                {op: ADD, path: ['x', 'd'], value: 4}
            ])
            expect(obj).toEqual({x: {a: 1, b: 2, c: 3, d: 4}});
        })

        it('should apply a remove patch', () => {
            let obj = mutableObject({x: {a: 1, b: 2, c:3}})
            patch(obj, [
                {op: REMOVE, path: ['x', 'c']}
            ])
            expect(obj).toEqual({x: {a: 1, b: 2}});
        })

    })

    describe('primitive arrays', () => {
        it('should apply a replace patch', () => {
            let obj = mutableObject([1,2,3])
            patch(obj, [
                {op: REPLACE, path: [0], value: 4},
                {op: REPLACE, path: [1], value: 5}
            ])
            expect(obj).toEqual([4,5,3]);
        })

        it('should apply an add patch', () => {
            let obj = mutableObject([1,2,3])
            patch(obj, [
                {op: ADD, path: [3], value: 4}
            ])
            expect(obj).toEqual([1,2,3,4]);
        })

        it('should apply a remove patch', () => {
            let obj = mutableObject([1,2,3])
            patch(obj, [
                {op: REMOVE, path: [1]},
            ])
            expect(obj).toEqual([1,3]);
        })
    })

    describe('object arrays', () => {
        it('should apply a replace patch', () => {
            let obj = mutableObject([{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}])
            patch(obj, [
                {op: REPLACE, path: [1], value: {id: 4, c: '4'}}
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 4, c:"4"}, {id: 3, c:"3"}]);
        })

        it('should apply an add patch', () => {
            let obj = mutableObject([{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}])
            patch(obj, [
                {op: ADD, path: [3], value: {id: 4, c:"4"}}
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}, {id: 4, c:"4"}]);
        })

        it('should apply a remove patch', () => {
            let obj = mutableObject([{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}])
            patch(obj, [
                {op: REMOVE, path: [1]},
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 3, c:"3"}]);
        })

        it('should apply a move patch', () => {
            let obj = mutableObject([{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}])
            patch(obj, [
                {op: MOVE, path: [1], from:[2]},
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 3, c:"3"}, {id: 2, c:"2"}]);
        })
    })

    describe('problems', () => {
        it('should ignore replace for non existing path', () => {
            let obj = mutableObject({a: {b: {c: {d: 1}}}})
            patch(obj, [
                {op: REPLACE, path: ['a', 'x', 'y', 'z'], value: 5}
            ])
            expect(obj).toEqual({a: {b: {c: {d: 1}}}});
        })
    })

    it('should ignore add for non existing path', () => {
        let obj = mutableObject({x: {a: 1, b: 2, c:3}})
        patch(obj, [
            {op: ADD, path: ['x', 'y', 'z'], value: 12}
        ])
        expect(obj).toEqual({x: {a: 1, b: 2}});
    })
})


