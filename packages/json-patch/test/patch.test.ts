import {describe, expect, it} from '@jest/globals'
import {patch} from "../lib";
import {ADD, JSONPatch, MOVE, REMOVE, REPLACE} from "../lib";

describe('apply JSON patch', () => {
    describe("flat object", () => {
        it('should apply a replace patch', () => {
            let obj = {a: 1, b: 2, c:3}
            obj = patch(obj, [
                {op: REPLACE, path: ['b'], value: 4},
                {op: REPLACE, path: ['c'], value: 5}
            ])
            expect(obj).toEqual({a: 1, b: 4, c: 5});
        })

        it('should apply an add patch', () => {
            let obj = {a: 1, b: 2, c:3}
            obj = patch(obj, [
                {op: ADD, path: ['d'], value: 4}
            ])
            expect(obj).toEqual({a: 1, b: 2, c: 3, d: 4});
        })

        it('should apply a remove patch', () => {
            let obj = {a: 1, b: 2, c:3}
            obj = patch(obj, [
                {op: REMOVE, path: ['c']}
            ])
            expect(obj).toEqual({a: 1, b: 2});
        })
    })

    describe("nested object", () => {
        it('should apply a replace patch', () => {
            let obj = {x: {a: 1, b: 2, c:3}}
            obj = patch(obj, [
                {op: REPLACE, path: ['x', 'b'], value: 4},
                {op: REPLACE, path: ['x', 'c'], value: 5}
            ])
            expect(obj).toEqual({x: {a: 1, b: 4, c: 5}});
        })

        it('should apply an add patch', () => {
            let obj = {x: {a: 1, b: 2, c:3}}
            obj = patch(obj, [
                {op: ADD, path: ['x', 'd'], value: 4}
            ])
            expect(obj).toEqual({x: {a: 1, b: 2, c: 3, d: 4}});
        })

        it('should apply a remove patch', () => {
            let obj = {x: {a: 1, b: 2, c:3}}
            obj = patch(obj, [
                {op: REMOVE, path: ['x', 'c']}
            ])
            expect(obj).toEqual({x: {a: 1, b: 2}});
        })

    })

    describe('primitive arrays', () => {
        it('should apply a replace patch', () => {
            let obj = [1,2,3]
            obj = patch(obj, [
                {op: REPLACE, path: [0], value: 4},
                {op: REPLACE, path: [1], value: 5}
            ])
            expect(obj).toEqual([4,5,3]);
        })

        it('should apply an add patch at the middle', () => {
            let obj = [1,2,3]
            obj = patch(obj, [
                {op: ADD, path: [1], value: 4}
            ])
            expect(obj).toEqual([1,4,2,3]);
        })

        it('should apply an add patch at the end', () => {
            let obj = [1,2,3]
            obj = patch(obj, [
                {op: ADD, path: [3], value: 4}
            ])
            expect(obj).toEqual([1,2,3,4]);
        })

        it('should apply a remove patch', () => {
            let obj = [1,2,3]
            obj = patch(obj, [
                {op: REMOVE, path: [1]},
            ])
            expect(obj).toEqual([1,3]);
        })
    })

    describe('object arrays', () => {
        it('should apply a replace patch', () => {
            let obj = [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}]
            obj = patch(obj, [
                {op: REPLACE, path: [1], value: {id: 4, c: '4'}}
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 4, c:"4"}, {id: 3, c:"3"}]);
        })

        it('should apply an add patch', () => {
            let obj = [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}]
            obj = patch(obj, [
                {op: ADD, path: [3], value: {id: 4, c:"4"}}
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}, {id: 4, c:"4"}]);
        })

        it('should apply a remove patch', () => {
            let obj = [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}]
            obj = patch(obj, [
                {op: REMOVE, path: [1]},
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 3, c:"3"}]);
        })

        it('should apply a move patch', () => {
            let obj = [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}]
            obj = patch(obj, [
                {op: MOVE, path: [1], from:[2]},
            ])
            expect(obj).toEqual([{id: 1, c:"1"}, {id: 3, c:"3"}, {id: 2, c:"2"}]);
        })
    })

    describe('complex object with both arrays and objects', () => {
        const originalTree = {
            "headChar": "▼",
            "node": {
                "name": "root",
                "id": "r",
                "children": [
                    {"id": "a", "name": "a node", "children": [
                            {"id": "aa", "name": "aa node", "children": []},
                            {"id": "ab", "name": "ab node", "children": []}
                        ]},
                    {"id": "b", "name": "b node", "children": [
                            {"id": "ba", "name": "ba node", "children": []}
                        ]},
                    {"id": "c", "name": "c node", "children": [
                            {"id": "ca", "name": "ca node", "children": []},
                            {"id": "cb", "name": "cb node", "children": []},
                            {"id": "cc", "name": "cc node", "children": []}
                        ]},
                    {"id": "d", "name": "d node", "children": [
                            {"id": "da", "name": "da node", "children": []}
                        ]}
                ]},
            "open": true
        }

        const patchForTree: JSONPatch = [
            {"op": "remove", "path": ["node", "children", 2]},
            {"op": "add", "path": ["node", "children", 2], "value": {
                    "id": "e", "name": "e node",
                    "children": [{"id": "ea", "name": "ea node", "children": []}]
                }
            },
            {"op": "remove", "path": ["node", "children", "0", "children", "1"]}
        ]

        it('should patch a complex tree', () => {
            const result = patch(originalTree, patchForTree)
            expect(result.node.children.length).toBe(4)
        })
    })

    describe('problems', () => {
        it('should ignore replace for non existing path', () => {
            let obj = {a: {b: {c: {d: 1}}}}
            obj = patch(obj, [
                {op: REPLACE, path: ['a', 'x', 'y', 'z'], value: 5}
            ])
            expect(obj).toEqual({a: {b: {c: {d: 1}}}});
        })

        it('should ignore add for non existing path', () => {
            let obj = {x: {a: 1, b: 2, c:3}}
            obj = patch(obj, [
                {op: ADD, path: ['x', 'y', 'z'], value: 12}
            ])
            expect(obj).toEqual({x: {a: 1, b: 2, c:3}});
        })

        it('should ignore move not from the same array', () => {
            let obj = {a: [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}], b: []}
            obj = patch(obj, [
                {op: MOVE, path: ['b', 1], from:['a', 2]},
            ])
            expect(obj).toEqual({a: [{id: 1, c:"1"}, {id: 2, c:"2"}, {id: 3, c:"3"}], b: []});
        })

    })

})


