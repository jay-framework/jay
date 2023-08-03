import {beforeEach, describe, expect, it} from '@jest/globals'
import {deserialize, serialize} from "../lib";
import {ArrayContexts} from "jay-json-patch";
import {ADD, JSONPatch, MOVE, REPLACE} from "jay-json-patch";

describe("mutable serialization", () => {

    describe('serialize', () => {
        const SIMPLE_OBJECT_1 = {a: 1, b:2, c: "abcd", d: true};
        const PATCH_1 = {op: ADD, path: [], value: SIMPLE_OBJECT_1}
        const SIMPLE_OBJECT_2 = {a: 11, b:2, c: "abcd", d: true};
        const PATCH_2 = {op: REPLACE, path: ['a'], value: 11}
        const SIMPLE_OBJECT_3 = {a: 11, b:12, c: "abcd", d: true};
        const PATCH_3 = {op: REPLACE, path: ['b'], value: 12}

        it('first time, create a patch with the whole object at path===[]', () => {
           let [patch, nextSerialize] = serialize(SIMPLE_OBJECT_1)
           expect(patch.length).toBe(1)
           expect(patch[0]).toEqual(PATCH_1)
        })

        it('second time, create a patch to update', () => {
            let [patch, nextSerialize] = serialize(SIMPLE_OBJECT_1);
            [patch, nextSerialize] = nextSerialize(SIMPLE_OBJECT_2)

            expect(patch.length).toBe(1)
            expect(patch[0]).toEqual(PATCH_2)
        })

        it('third time, create a patch to update only the updated property', () => {
            let [patch, nextSerialize] = serialize(SIMPLE_OBJECT_1);
            [patch, nextSerialize] = nextSerialize(SIMPLE_OBJECT_2);
            [patch, nextSerialize] = nextSerialize(SIMPLE_OBJECT_3)

            expect(patch.length).toBe(1)
            expect(patch[0]).toEqual(PATCH_3)
        })
    })

    describe('deserialize', () => {
        const SIMPLE_OBJECT_1 = {a: 1, b:2, c: "abcd", d: true};
        const PATCH_1: JSONPatch = [{op: ADD, path: [], value: SIMPLE_OBJECT_1}]
        const SIMPLE_OBJECT_2 = {a: 11, b:2, c: "abcd", d: true};
        const PATCH_2: JSONPatch = [{op: REPLACE, path: ['a'], value: 11}]
        const SIMPLE_OBJECT_3 = {a: 11, b:12, c: "abcd", d: true};
        const PATCH_3: JSONPatch = [{op: REPLACE, path: ['b'], value: 12}]

        it('first time, create the base object', () => {
            let [target, nextSerialize] = deserialize(PATCH_1)
            expect(target).toEqual(SIMPLE_OBJECT_1)
        })

        it('second time, update the target object', () => {
            let [target, nextSerialize] = deserialize(PATCH_1);
            [target, nextSerialize] = nextSerialize(PATCH_2)
            expect(target).toEqual(SIMPLE_OBJECT_2)
        })

        it('second time, update the target object', () => {
            let [target, nextSerialize] = deserialize(PATCH_1);
            [target, nextSerialize] = nextSerialize(PATCH_2);
            [target, nextSerialize] = nextSerialize(PATCH_3)
            expect(target).toEqual(SIMPLE_OBJECT_3)
        })
    })

    describe("simple immutable objects patch into mutable", () => {
        const SIMPLE_OBJECT = {a: 1, b:2, c: "abcd", d: true};

        it("should deserialize to an equal object", () => {
            let immutable = SIMPLE_OBJECT;
            let [patch] = serialize(immutable);
            let [target] = deserialize(patch);
            expect(immutable).toEqual(target);
        })

        it("should re-serialize and re-deserialize to an equal and different object", () => {
            let immutable = SIMPLE_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [target, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, a: 12};
            [patch] = nextSerialize(immutable);
            let [target_2] = nextDeserialize(patch)
            expect(immutable).toEqual(target_2);
            expect(target).not.toBe(target_2);
        })

        it("given a large change that patch sends the whole object, should update deserialize to an equal yes different object", () => {
            let immutable = SIMPLE_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [target, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, a: 12, c: 'efgh', d: false};
            [patch] = nextSerialize(immutable);
            let [target_2] = nextDeserialize(patch)
            expect(immutable).toEqual(target_2);
            expect(target).not.toBe(target_2);
        })
    })

    describe("nested immutable object", () => {
        const NESTED_OBJECT = {
            a: 1, b:2, name: {firstName: "Joe", lastName: "Smith"}
        };
        const NESTED_OBJECT_UPDATE = {firstName: "Mark", lastName: "Webber"}

        it("should deserialize to an equal object", () => {
            let immutable = NESTED_OBJECT;
            let [patch] = serialize(immutable);
            let [target] = deserialize(patch);
            expect(immutable).toEqual(target);
        })

        it("should re-serialize and re-deserialize to an equal and different object", () => {
            let immutable = NESTED_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [target, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, name: NESTED_OBJECT_UPDATE};
            [patch] = nextSerialize(immutable);
            let [target_2] = nextDeserialize(patch)
            expect(immutable).toEqual(target_2);
            expect(target).not.toBe(target_2);
        })

    })

    describe("immutable array of primitives", () => {
        const ARRAY_PRIMITIVES = {
            items: [1,2,3,4]
        }
        const ARRAY_PRIMITIVES_UPDATE = [1,2,3,4,5]

        it("should deserialize to an equal object", () => {
            let immutable = ARRAY_PRIMITIVES;
            let [patch] = serialize(immutable);
            let [target] = deserialize(patch);
            expect(immutable).toEqual(target);
        })

        it("should re-serialize and re-deserialize to an equal, yet different object", () => {
            let immutable = ARRAY_PRIMITIVES;
            let [patch, nextSerialize] = serialize(immutable);
            let [target, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, items: ARRAY_PRIMITIVES_UPDATE};
            [patch] = nextSerialize(immutable);
            let [target_2] = nextDeserialize(patch)
            expect(immutable).toEqual(target_2);
            expect(target).not.toBe(target_2);
        })

    })

    describe("immutable array of objects", () => {
        const ARRAY_OBJECTS = {
            items: [
                {id: "one", name: "Joe", age: 12},
                {id: "two", name: "Mark", age: 24},
                {id: "three", name: "Bill", age: 53}
            ]
        }
        const ARRAY_OBJECTS_ITEM_1_UPDATE = {id: "two", name: "Mark Smith", age: 37}

        it("should deserialize to an equal object", () => {
            let immutable = ARRAY_OBJECTS;
            let [patch] = serialize(immutable);
            let [target] = deserialize(patch);
            expect(immutable).toEqual(target);
        })

        describe('array mutations', () => {
            it("array item update", () => {
                let immutable = ARRAY_OBJECTS;
                let [patch, nextSerialize] = serialize(immutable);
                let [target, nextDeserialize] = deserialize(patch);

                immutable = {...immutable,
                    items: immutable.items
                        .map((item, index) => index === 1?ARRAY_OBJECTS_ITEM_1_UPDATE:item)
                };
                [patch] = nextSerialize(immutable);
                let [target_2] = nextDeserialize(patch)
                expect(immutable).toEqual(target_2);
                expect(target).not.toBe(target_2);
            })

            it("move array items on re-deserialization, given a context", () => {
                let original = structuredClone(ARRAY_OBJECTS);
                let contexts: ArrayContexts = [[['items'], {matchBy: 'id'}]]
                let [patch, nextSerialize] = serialize(original, contexts);
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let updated = {items: [
                        original.items[0],
                        original.items[2],
                        original.items[1]
                    ]}

                let target_item_1 = target.items[1];
                let target_item_2 = target.items[2];
                [patch] = nextSerialize(updated);
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(updated).toEqual(target_2);
                expect(target).not.toBe(target_2);
                expect(target_2.items[1]).toBe(target_item_2)
                expect(target_2.items[2]).toBe(target_item_1)
            })

            it("update to an equal array if not given a context", () => {
                let original = ARRAY_OBJECTS;
                let [patch, nextSerialize] = serialize(original);
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let updated = {items: [
                        original.items[0],
                        original.items[2],
                        original.items[1]
                    ]}

                let target_item_1 = target.items[1];
                let target_item_2 = target.items[2];
                [patch] = nextSerialize(updated);
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(updated).toEqual(target_2);
                expect(target).not.toBe(target_2);
                expect(target_2.items[1]).toEqual(target_item_2)
                expect(target_2.items[2]).toEqual(target_item_1)
            })
        })

    })
})