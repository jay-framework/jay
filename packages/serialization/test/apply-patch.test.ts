import {describe, expect, it} from '@jest/globals'
import {mutableObject} from "jay-mutable";
import {applyPatch} from "../lib/deserialize/apply-patch";
import {ADD, REMOVE, REPLACE} from "../lib/types";

describe('apply JSON patch', () => {
    it('should apply a replace patch on a flat object', () => {
        let obj = mutableObject({a: 1, b: 2, c:3})
        applyPatch(obj, [
            {op: REPLACE, path: ['b'], value: 4},
            {op: REPLACE, path: ['c'], value: 5}
        ])
        expect(obj).toEqual({a: 1, b: 4, c: 5});
    })

    it('should apply an add patch on a flat object', () => {
        let obj = mutableObject({a: 1, b: 2, c:3})
        applyPatch(obj, [
            {op: ADD, path: ['d'], value: 4}
        ])
        expect(obj).toEqual({a: 1, b: 2, c: 3, d: 4});
    })

    it('should apply a remove patch on a flat object', () => {
        let obj = mutableObject({a: 1, b: 2, c:3})
        applyPatch(obj, [
            {op: REMOVE, path: ['c']}
        ])
        expect(obj).toEqual({a: 1, b: 2});
    })
})


