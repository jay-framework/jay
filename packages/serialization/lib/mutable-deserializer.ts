import {mutableObject} from "jay-mutable/";
import {ADD, JSONPatch, REPLACE} from "./types";
import {patch} from "./deserialize/patch";
import {MutableContract} from "jay-mutable";

export type Deserialize<T> = (jsonPatch: JSONPatch) => [T, Deserialize<T>]
export function deserialize<T extends MutableContract>(jsonPatch: JSONPatch): [T, Deserialize<T>] {
    return _deserialize(undefined)(jsonPatch)
}

function _deserialize<T extends MutableContract>(mutable: T): (jsonPatch: JSONPatch) => [T, Deserialize<T>] {
    return (jsonPatch: JSONPatch) => {
        if (jsonPatch.length === 1 && jsonPatch[0].op === ADD && jsonPatch[0].path.length === 0) {
            mutable = mutableObject(jsonPatch[0].value) as T;
            return [mutable, _deserialize(mutable)]
        }
        if (!mutable)
            mutable = mutableObject({}) as T;
        if (jsonPatch.length === 1 && jsonPatch[0].path.length === 0 && jsonPatch[0].op === REPLACE)
            (mutable as MutableContract).setOriginal(jsonPatch[0].value)
        else
            patch(mutable, jsonPatch)
        return [mutable, _deserialize(mutable)]
    }
}
