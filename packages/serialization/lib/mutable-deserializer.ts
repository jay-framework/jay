import {mutableObject} from "jay-mutable/";
import {ADD, JSONPatch, REPLACE} from "./types";
import {patch} from "./deserialize/patch";
import {MutableContract} from "jay-mutable";

export type Deserialize<T> = (serialized: JSONPatch) => [T, Deserialize<T>]
export function deserialize<T extends MutableContract>(serialized: JSONPatch): [T, Deserialize<T>] {
    return _deserialize(undefined)(serialized)
}

function _deserialize<T extends MutableContract>(mutable: T): (serialized: JSONPatch) => [T, Deserialize<T>] {
    return (serialized: JSONPatch) => {
        if (serialized.length === 1 && serialized[0].op === ADD && serialized[0].path.length === 0) {
            mutable = mutableObject(serialized[0].value) as T;
            return [mutable, _deserialize(mutable)]
        }
        if (!mutable)
            mutable = mutableObject({}) as T;
        if (serialized.length === 1 && serialized[0].path.length === 0 && serialized[0].op === REPLACE)
            (mutable as MutableContract).setOriginal(serialized[0].value)
        else
            patch(mutable, serialized)
        return [mutable, _deserialize(mutable)]
    }
}
