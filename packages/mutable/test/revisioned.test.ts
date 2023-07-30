import {describe, expect, it} from '@jest/globals'
import {checkModified, touchRevision} from "../lib/revisioned";
import {mockMutable} from "./mock-mutable";

describe('isModified', () => {
    it('should return true for first number', () => {
        let [value, isModified] = checkModified(2);
        expect(isModified).toBe(true)
        expect(value.value).toBe(2)
    })

    it('should return false for two similar numbers', () => {
        let [value, isModified] = checkModified(2);
        [value, isModified] = checkModified(2, value);
        expect(isModified).toBe(false)
        expect(value.value).toBe(2)
    })

    it('should return true for two different numbers', () => {
        let [value, isModified] = checkModified(2);
        [value, isModified] = checkModified(4, value);
        expect(isModified).toBe(true)
        expect(value.value).toBe(4)
    })

    it('should return false for two similar strings', () => {
        let [value, isModified] = checkModified('abc');
        [value, isModified] = checkModified('abc', value);
        expect(isModified).toBe(false)
        expect(value.value).toBe('abc')
    })

    it('should return true for two different strings', () => {
        let [value, isModified] = checkModified('abc');
        [value, isModified] = checkModified('dev', value);
        expect(isModified).toBe(true)
        expect(value.value).toBe('dev')
    })

    it('should return false for two similar booleans', () => {
        let [value, isModified] = checkModified(false);
        [value, isModified] = checkModified(false, value);
        expect(isModified).toBe(false)
        expect(value.value).toBe(false)
    })

    it('should return true for two different booleans', () => {
        let [value, isModified] = checkModified(false);
        [value, isModified] = checkModified(true, value);
        expect(isModified).toBe(true)
        expect(value.value).toBe(true)
    })

    // tests for date

    describe('support for immutable objects', () => {

        const objA = {};
        const objB = {};
        it('should return false for the same object', () => {
            let [value, isModified] = checkModified(objA);
            [value, isModified] = checkModified(objA, value);
            expect(isModified).toBe(false)
            expect(value.value).toBe(objA)
        })

        it('should return true for two different objects', () => {
            let [value, isModified] = checkModified(objA);
            [value, isModified] = checkModified(objB, value);
            expect(isModified).toBe(true)
            expect(value.value).toBe(objB)
        })
    })

    describe('support for mutable objects', () => {
        const objA = mockMutable({});
        it('should return false for objects with the same revision', () => {
            let [value, isModified] = checkModified(objA);
            [value, isModified] = checkModified(objA, value);
            expect(isModified).toBe(false)
            expect(value.value).toBe(objA)
        })

        it('should return true for objects with different revision', () => {
            let [value, isModified] = checkModified(objA);
            touchRevision(objA);
            [value, isModified] = checkModified(objA, value);
            expect(isModified).toBe(true)
            expect(value.value).toBe(objA)
        })
    })

    // describe('support for mutable arrays', () => {
    //     const arrA = [1,2,3];
    //     arrA[REVISION] = 1;
    //     const arrB = [1,2,3];
    //     arrB[REVISION] = 1;
    //     const arrC = [1,2,3,4];
    //     arrC[REVISION] = 2;
    //     it('should return false for objects with the same revision', () => {
    //         expect(isModified(objA, objB)).toBe(false)
    //     })
    //
    //     it('should return true for objects with different revision', () => {
    //         expect(isModified(objA, objC)).toBe(true)
    //     })
    //
    // })

})
