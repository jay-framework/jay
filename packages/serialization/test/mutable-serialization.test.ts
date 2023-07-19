import {beforeEach, describe, expect, it} from '@jest/globals'
import {mutableObject} from "jay-mutable";
import {deserialize, serialize} from "../lib";
import {ArrayContexts} from "../lib/serialize/diff";
import {MOVE, REPLACE} from "jay-mutable-contract";

describe("mutable serialization", () => {
    describe("simple mutable objects", () => {
        let SIMPLE_OBJECT;
        beforeEach(() => {
            SIMPLE_OBJECT = {a: 1, b:2, c: "abcd", d: true};
        })

        it("should deserialize to an equal object", () => {
            let original = mutableObject(SIMPLE_OBJECT);
            let [patch] = serialize(original.freeze());
            patch = structuredClone(patch);
            let [target] = deserialize(patch);
            expect(original).toEqual(target);
        })

        it("should re-serialize and re-deserialize to an equal object", () => {
            let original = mutableObject(SIMPLE_OBJECT);
            let [patch, nextSerialize] = serialize(original.freeze());
            patch = structuredClone(patch);
            let [target, nextDeserialize] = deserialize(patch);

            original.a = 12
            original.c = 'efgh'
            original.d = false;
            [patch] = nextSerialize(original.freeze());
            patch = structuredClone(patch);
            let [target_2] = nextDeserialize(patch)
            expect(original).toEqual(target_2);
            expect(target).not.toBe(target_2);
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

    describe("nested mutable object", () => {

        describe("basic serialization", () => {
            let NESTED_OBJECT;
            let NESTED_OBJECT_UPDATE;
            beforeEach(() => {
                NESTED_OBJECT = {
                    a: 1, b:2, name: {firstName: "Joe", lastName: "Smith"}
                };
                NESTED_OBJECT_UPDATE = {firstName: "Mark", lastName: "Webber"}
            })

            it("should deserialize to an equal object", () => {
                let original = mutableObject(NESTED_OBJECT);
                let [patch] = serialize(original.freeze());
                patch = structuredClone(patch);
                let [target] = deserialize(patch);
                expect(original).toEqual(target);
            })

            it("should re-serialize and re-deserialize to an equal object yet different object", () => {
                let original = mutableObject(NESTED_OBJECT);
                let [patch, nextSerialize] = serialize(original.freeze());
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize(patch);

                original.name = NESTED_OBJECT_UPDATE;
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
            })

            it("should preserve child object if not updated", () => {
                let original = mutableObject(NESTED_OBJECT);
                let [patch, nextSerialize] = serialize(original.freeze());
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize(patch);

                original.a = 12;
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
                expect((target as any).name).toBe((target_2 as any).name);
            })

            it('should serialize mutable object child of immutable', () => {
                let obj: any = NESTED_OBJECT;
                obj.name = mutableObject(NESTED_OBJECT.name);
                let [patch] = serialize({...obj, name: obj.name.freeze()});
                patch = structuredClone(patch);
                let [target] = deserialize<any>(patch);
                expect(obj).toEqual(target);
            })

            it('should serialize updates on a mutable object child of immutable`', () => {
                let obj: any = NESTED_OBJECT;
                obj.name = mutableObject(NESTED_OBJECT.name);
                let [patch, nextSerialize] = serialize({...obj, name: obj.name.freeze()});
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize<any>(patch);

                obj.name.firstName = NESTED_OBJECT_UPDATE.firstName;
                obj.name.lastName = NESTED_OBJECT_UPDATE.lastName;
                [patch] = nextSerialize({...obj, name: obj.name.freeze()});
                patch = structuredClone(patch);

                let [target_2] = nextDeserialize(patch)
                expect(target_2.name).toEqual(NESTED_OBJECT_UPDATE)
            })
        })

        describe('unchanged nested mutable objects optimization', () => {
            let NESTED_OBJECT;
            let NESTED_OBJECT_UPDATE;
            beforeEach(() => {
                NESTED_OBJECT = {
                    a: 1,
                    b:2,
                    name: {firstName: "Joe", lastName: "Smith"},
                    address: {street: "124 main st", city: "springfield", state: "alabama"}
                };
                NESTED_OBJECT_UPDATE = {firstName: "Mark", lastName: "Webber"}
            })

            it("should not re-serialize unchanged object (address), yet preserve it on re-deserialize", () => {
                let original = mutableObject(NESTED_OBJECT);
                let [patch, nextSerialize] = serialize(original.freeze());
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize(patch);

                original.name = NESTED_OBJECT_UPDATE;
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                expect(patch).toEqual([{op: REPLACE, path: ["name"], value: {firstName: "Mark", lastName: "Webber"}}])
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
            })

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

    describe("mutable array of primitives", () => {
        let ARRAY_PRIMITIVES
        let ARRAY_PRIMITIVES_UPDATE
        beforeEach(() => {
            ARRAY_PRIMITIVES = {
                items: [1,2,3,4]
            }
            ARRAY_PRIMITIVES_UPDATE = [1,2,3,4,5]
        })

        it("should deserialize to an equal object", () => {
            let original = mutableObject(ARRAY_PRIMITIVES);
            let [patch] = serialize(original.freeze());
            patch = structuredClone(patch);
            let [target] = deserialize(patch);
            expect(original).toEqual(target);
        })

        it("should re-serialize and re-deserialize to an equal object yet different", () => {
            let original = mutableObject(ARRAY_PRIMITIVES);
            let [patch, nextSerialize] = serialize(original.freeze());
            patch = structuredClone(patch);
            let [target, nextDeserialize] = deserialize(patch);

            original.items = ARRAY_PRIMITIVES_UPDATE;
            [patch] = nextSerialize(original.freeze());
            patch = structuredClone(patch);
            let [target_2] = nextDeserialize(patch)
            expect(original).toEqual(target_2);
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

    describe("mutable array of objects", () => {
        let ARRAY_OBJECTS;
        let ARRAY_OBJECTS_ITEM_1_UPDATE;

        beforeEach(() => {
            ARRAY_OBJECTS = {
                items: [
                    {id: "one", name: "Joe", age: 12},
                    {id: "two", name: "Mark", age: 24},
                    {id: "three", name: "Bill", age: 53}
                ]
            }
            ARRAY_OBJECTS_ITEM_1_UPDATE = {id: "two", name: "Mark Smith", age: 37}
        })

        it("should deserialize to an equal object", () => {
            let original = mutableObject(ARRAY_OBJECTS);
            let [patch] = serialize(original.freeze());
            patch = structuredClone(patch);
            let [target] = deserialize(patch);
            expect(original).toEqual(target);
        })

        describe('array mutations', () => {
            it("array item update", () => {
                let original = mutableObject(ARRAY_OBJECTS);
                let [patch, nextSerialize] = serialize(original.freeze());
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize(patch);

                Object.assign(original.items[1], ARRAY_OBJECTS_ITEM_1_UPDATE);
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
            })

            it("move array items using a move patch", () => {
                let original = mutableObject(ARRAY_OBJECTS);
                let contexts: ArrayContexts = [[['items'], {matchBy: 'id'}]]
                let [patch, nextSerialize] = serialize(original.freeze(), contexts);
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let i1 = original.items[1];
                original.items[1] = original.items[2];
                original.items[2] = i1;

                let target_item_1 = target.items[1];
                let target_item_2 = target.items[2];
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                expect(patch.length).toBe(1)
                expect(patch[0].op).toBe(MOVE);
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
                expect(target_2.items[1]).toBe(target_item_2)
                expect(target_2.items[2]).toBe(target_item_1)
            })
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
                let original = mutableObject(ARRAY_OBJECTS);
                let contexts: ArrayContexts = [[['items'], {matchBy: 'id'}]]
                let [patch, nextSerialize] = serialize(original.freeze(), contexts);
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let i1 = original.items[1];
                original.items[1] = original.items[2];
                original.items[2] = i1;

                let target_item_1 = target.items[1];
                let target_item_2 = target.items[2];
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
                expect(target_2.items[1]).toBe(target_item_2)
                expect(target_2.items[2]).toBe(target_item_1)
            })

            it("update to an equal array if not given a context", () => {
                let original = mutableObject(ARRAY_OBJECTS);
                let [patch, nextSerialize] = serialize(original.freeze());
                patch = structuredClone(patch);
                let [target, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let i1 = original.items[1];
                original.items[1] = original.items[2];
                original.items[2] = i1;

                let target_item_1 = target.items[1];
                let target_item_2 = target.items[2];
                [patch] = nextSerialize(original.freeze());
                patch = structuredClone(patch);
                let [target_2] = nextDeserialize(patch)
                expect(original).toEqual(target_2);
                expect(target).not.toBe(target_2);
                expect(target_2.items[1]).toEqual(target_item_2)
                expect(target_2.items[2]).toEqual(target_item_1)
            })
        })

    })
})