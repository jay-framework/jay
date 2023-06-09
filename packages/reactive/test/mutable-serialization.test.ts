import {describe, expect, it, jest} from '@jest/globals'
import {getRevision, mutableObject} from "../lib";
import {serialize} from "../lib/mutable-serializer";
import {deserialize} from "../lib/mutable-deserializer";

const SIMPLE_OBJECT = {a: 1, b:2, c: "abcd", d: true};
const NESTED_OBJECT = {
    a: 1, b:2, name: {firstName: "Joe", lastName: "Smith"}
};
const NESTED_OBJECT_UPDATE = {firstName: "Mark", lastName: "Webber"}
const ARRAY_PRIMITIVES = {
    items: [1,2,3,4]
}
const ARRAY_PRIMITIVES_UPDATE = [1,2,3,4,5]

describe("mutable serialization", () => {
    describe("simple objects", () => {
        it("should deserialize to an equal object", () => {
            let mutable = mutableObject(SIMPLE_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject(SIMPLE_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            console.log(serialized);
            let [deserialized, nextDeserialize] = deserialize(serialized);

            let revision = getRevision(mutable);
            let deserializedRevision = getRevision(deserialized);

            expect(revision.revNum).toEqual(deserializedRevision.revNum);
        })

        it("should re-serialize and re-deserialize to an equal object", () => {
            let mutable = mutableObject(SIMPLE_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);

            mutable.a = 12
            mutable.c = 'efgh'
            mutable.d = false;
            [serialized, nextSerialize] = nextSerialize(mutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(serialized)
            expect(mutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
        })
    })

    describe("nested object", () => {
        it("should deserialize to an equal object", () => {
            let mutable = mutableObject(NESTED_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject(NESTED_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);

            let revision = getRevision(mutable);
            let revision_name = getRevision(mutable.name);
            let deserializedRevision = getRevision(deserialized);
            let deserializedRevision_name = getRevision((deserialized as typeof NESTED_OBJECT).name);

            expect(revision.revNum).toEqual(deserializedRevision.revNum);
            expect(revision_name.revNum).toEqual(deserializedRevision_name.revNum);
        })

        it("should re-serialize and re-deserialize to an equal object", () => {
            let mutable = mutableObject(NESTED_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);

            mutable.name = NESTED_OBJECT_UPDATE;
            [serialized, nextSerialize] = nextSerialize(mutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(serialized)
            expect(mutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
        })

    })

    describe("array of primitives", () => {
        it("should deserialize to an equal object", () => {
            let mutable = mutableObject(ARRAY_PRIMITIVES);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject(ARRAY_PRIMITIVES);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);

            let revision = getRevision(mutable);
            let revision_items = getRevision(mutable.items);
            let deserializedRevision = getRevision(deserialized);
            let deserializedRevision_items = getRevision((deserialized as typeof ARRAY_PRIMITIVES).items);

            expect(revision.revNum).toEqual(deserializedRevision.revNum);
            expect(revision_items.revNum).toEqual(deserializedRevision_items.revNum);
        })

        it("should re-serialize and re-deserialize to an equal object", () => {
            let mutable = mutableObject(ARRAY_PRIMITIVES);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);

            mutable.items = ARRAY_PRIMITIVES_UPDATE;
            [serialized, nextSerialize] = nextSerialize(mutable);
            let [deserialized2, nextDeserialize2] = nextDeserialize(serialized)
            expect(mutable).toEqual(deserialized2);
            expect(deserialized).toBe(deserialized2);
        })

    })
})