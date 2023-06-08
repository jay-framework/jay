import {describe, expect, it, jest} from '@jest/globals'
import {getRevision, mutableObject} from "../lib";
import {serialize} from "../lib/mutable-serializer";
import {deserialize} from "../lib/mutable-deserializer";

const SIMPLE_OBJECT = {a: 1, b:2, c: "abcd", d: true};
describe("mutable serialization", () => {
    describe("simple objects", () => {
        it("should deserialize to an equal object", () => {
            let mutable = mutableObject(SIMPLE_OBJECT);
            let [serialized, nextSerialize] = serialize(mutable);
            let [deserialized, nextDeserialize] = deserialize(serialized);
            expect(mutable).toEqual(deserialized);
        })

        it("should serialize and deserialize the mutable revision", () => {
            let mutable = mutableObject({a: 1, b:2});
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
})