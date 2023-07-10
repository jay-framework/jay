import {describe, expect, it, jest, beforeEach} from '@jest/globals'
import {mutableObject} from "jay-mutable";
import {getRevision} from "jay-reactive";
import {serialize} from "../lib";
import {deserialize} from "../lib";

describe("mutable serialization", () => {
    describe("simple mutable objects", () => {
        let SIMPLE_OBJECT;
        beforeEach(() => {
            SIMPLE_OBJECT = {a: 1, b:2, c: "abcd", d: true};
        })

        it("should deserialize to an equal object", () => {
            let mutable = mutableObject(SIMPLE_OBJECT, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject(SIMPLE_OBJECT, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            let originalRevision = getRevision(mutable);
            let deserializedRevision = getRevision(deserialized);
            expect(deserializedRevision.revNum).toBeGreaterThan(originalRevision.revNum);
        })

        it("should re-serialize and re-deserialize to an equal object", () => {
            let mutable = mutableObject(SIMPLE_OBJECT, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            let deserialized_revition_1 = getRevision(deserialized);

            mutable.a = 12
            mutable.c = 'efgh'
            mutable.d = false;
            [patch, nextSerialize] = nextSerialize(mutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
            let deserialized_revition_2 = getRevision(deserialized);
            expect(mutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
            expect(deserialized_revition_2.revNum).toBeGreaterThan(deserialized_revition_1.revNum)
        })
    })

    describe("simple immutable objects patch into mutable", () => {
        const SIMPLE_OBJECT = {a: 1, b:2, c: "abcd", d: true};

        it("should deserialize to an equal object", () => {
            let immutable = SIMPLE_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(immutable).toEqual(deserialized);
        })

        it("should re-serialize and re-deserialize to an equal and the same mutable object", () => {
            let immutable = SIMPLE_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, a: 12};
            [patch, nextSerialize] = nextSerialize(immutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
            expect(immutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
        })

        it("given a large change that patch sends the whole object, should update the result mutable with the change", () => {
            let immutable = SIMPLE_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, a: 12, c: 'efgh', d: false};
            [patch, nextSerialize] = nextSerialize(immutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
            expect(immutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
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
                let mutable = mutableObject(NESTED_OBJECT);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize(patch);
                expect(mutable).toEqual(deserialized);
            })

            it("should serialize and deserialize the mutable revision", () => {
                let mutable = mutableObject(NESTED_OBJECT);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize<any>(patch);

                let originalRevision = getRevision(mutable);
                let originalRevision_name = getRevision(mutable.name);
                let deserializedRevision = getRevision(deserialized);
                let deserializedRevision_name = getRevision(deserialized.name);

                expect(originalRevision.revNum).toBeLessThan(deserializedRevision.revNum);
                expect(originalRevision_name.revNum).toBeLessThan(deserializedRevision_name.revNum);
            })

            it("should re-serialize and re-deserialize to an equal object", () => {
                let mutable = mutableObject(NESTED_OBJECT, true);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize(patch);
                let deserialized_revition_1 = getRevision(deserialized);
                let deserialized_revition_name_1 = getRevision((deserialized as any).name);

                mutable.name = NESTED_OBJECT_UPDATE;
                [patch, nextSerialize] = nextSerialize(mutable);
                let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
                let deserialized_revition_2 = getRevision(deserialized);
                let deserialized_revition_name_2 = getRevision((deserialized as any).name);
                expect(mutable).toEqual(deserialized2);
                expect(deserialized).toBe(deserialized2);
                expect(deserialized_revition_2.revNum).toBeGreaterThan(deserialized_revition_1.revNum)
                expect(deserialized_revition_name_2.revNum).toBeGreaterThan(deserialized_revition_name_1.revNum)
            })

            it('should serialize mutable object child of immutable', () => {
                let obj: any = NESTED_OBJECT;
                obj.name = mutableObject(NESTED_OBJECT.name, true);
                let [patch, nextSerialize] = serialize(obj);
                let [deserialized, nextDeserialize] = deserialize<any>(patch);
                expect(obj).toEqual(deserialized);

                let original_revision_name = getRevision(obj.name);
                let deserializedRevision_name = getRevision(deserialized.name);
                expect(original_revision_name.revNum).toBeLessThan(deserializedRevision_name.revNum);
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
                let mutable = mutableObject(NESTED_OBJECT, true);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize(patch);

                mutable.name = NESTED_OBJECT_UPDATE;
                [patch, nextSerialize] = nextSerialize(mutable);
                let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
                expect(mutable).toEqual(deserialized2);
                expect(deserialized).toBe(deserialized2);
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
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(immutable).toEqual(deserialized);
        })

        it("should re-serialize and re-deserialize to an equal and same object", () => {
            let immutable = NESTED_OBJECT;
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, name: NESTED_OBJECT_UPDATE};
            [patch, nextSerialize] = nextSerialize(immutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
            expect(immutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
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
            let mutable = mutableObject(ARRAY_PRIMITIVES, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject(ARRAY_PRIMITIVES, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            let originalRevision = getRevision(mutable);
            let originalRevision_items = getRevision(mutable.items);
            let deserializedRevision = getRevision(deserialized);
            let deserializedRevision_items = getRevision((deserialized as typeof ARRAY_PRIMITIVES).items);

            expect(originalRevision.revNum).toBeLessThan(deserializedRevision.revNum);
            expect(originalRevision_items.revNum).toBeLessThan(deserializedRevision_items.revNum);
        })

        it("should re-serialize and re-deserialize to an equal object", () => {
            let mutable = mutableObject(ARRAY_PRIMITIVES, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            mutable.items = ARRAY_PRIMITIVES_UPDATE;
            [patch, nextSerialize] = nextSerialize(mutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
            expect(mutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
        })

    })

    describe("immutable array of primitives", () => {
        const ARRAY_PRIMITIVES = {
            items: [1,2,3,4]
        }
        const ARRAY_PRIMITIVES_UPDATE = [1,2,3,4,5]

        it("should deserialize to an equal object", () => {
            let immutable = ARRAY_PRIMITIVES;
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(immutable).toEqual(deserialized);
        })

        it("should re-serialize and re-deserialize to an equal, the same object", () => {
            let immutable = ARRAY_PRIMITIVES;
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            immutable = {...immutable, items: ARRAY_PRIMITIVES_UPDATE};
            [patch, nextSerialize] = nextSerialize(immutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
            expect(immutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
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
            let mutable = mutableObject(ARRAY_OBJECTS, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject(ARRAY_OBJECTS, true);
            let [patch, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(patch);

            let originalRevision = getRevision(mutable);
            let originalRevision_items = getRevision(mutable.items);
            let deserializedRevision = getRevision(deserialized);
            let deserializedRevision_items = getRevision((deserialized as typeof ARRAY_OBJECTS).items);

            expect(originalRevision.revNum).toBeLessThan(deserializedRevision.revNum);
            expect(originalRevision_items.revNum).toBeLessThan(deserializedRevision_items.revNum);
            for (let i=0; i < 3; i++) {
                let itemRev = getRevision(mutable.items[i]);
                let deserializedItemRev = getRevision((deserialized as typeof ARRAY_OBJECTS).items[i]);
                expect(itemRev.revNum).toBeLessThan(deserializedItemRev.revNum);
            }
        })

        describe('array mutations', () => {
            it("array item update", () => {
                let mutable = mutableObject(ARRAY_OBJECTS, true);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize(patch);

                Object.assign(mutable.items[1], ARRAY_OBJECTS_ITEM_1_UPDATE);
                [patch, nextSerialize] = nextSerialize(mutable);
                let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
                expect(mutable).toEqual(deserialized2);
                expect(deserialized).toBe(deserialized2);
            })

            it.skip("move array items on re-deserialization", () => {
                let mutable = mutableObject(ARRAY_OBJECTS, true);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let i1 = mutable.items[1];
                let i2 = mutable.items[2];
                mutable.items[1] = i2;
                mutable.items[2] = i1;

                let deserializedItem_1 = deserialized.items[1];
                let deserializedItem_2 = deserialized.items[2];
                [patch, nextSerialize] = nextSerialize(mutable);
                let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
                expect(mutable).toEqual(deserialized2);
                expect(deserialized).toBe(deserialized2);
                expect(deserialized.items[1]).toBe(deserializedItem_2)
                expect(deserialized.items[2]).toBe(deserializedItem_1)
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
            let [patch, nextSerialize] = serialize(immutable);
            let [deserialized, nextDeserialize] = deserialize(patch);
            expect(immutable).toEqual(deserialized);
        })

        describe('array mutations', () => {
            it("array item update", () => {
                let immutable = ARRAY_OBJECTS;
                let [patch, nextSerialize] = serialize(immutable);
                let [deserialized, nextDeserialize] = deserialize(patch);

                immutable = {...immutable,
                    items: immutable.items
                        .map((item, index) => index === 1?ARRAY_OBJECTS_ITEM_1_UPDATE:item)
                };
                [patch, nextSerialize] = nextSerialize(immutable);
                let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
                expect(immutable).toEqual(deserialized2);
                expect(deserialized).toBe(deserialized2);
            })

            it.skip("move array items on re-deserialization", () => {
                let mutable = mutableObject(ARRAY_OBJECTS, true);
                let [patch, nextSerialize] = serialize(mutable);
                let [deserialized, nextDeserialize] = deserialize<any>(patch);

                // replace items 1 and 2
                let i1 = mutable.items[1];
                let i2 = mutable.items[2];
                mutable.items[1] = i2;
                mutable.items[2] = i1;

                let deserializedItem_1 = deserialized.items[1];
                let deserializedItem_2 = deserialized.items[2];
                [patch, nextSerialize] = nextSerialize(mutable);
                let [deserialized2, nextDeserialize2] = nextDeserialize(patch)
                expect(mutable).toEqual(deserialized2);
                expect(deserialized).toBe(deserialized2);
                expect(deserialized.items[1]).toBe(deserializedItem_2)
                expect(deserialized.items[2]).toBe(deserializedItem_1)
            })
        })

    })
})