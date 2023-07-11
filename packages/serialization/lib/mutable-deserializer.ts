import {mutableObject} from "jay-mutable/";
import {ADD, JSONPatch, REPLACE, MutableContract} from "jay-mutable-contract";
import {patch} from "./deserialize/patch";

export type Deserialize<T extends object> = (jsonPatch: JSONPatch) => [T, Deserialize<T>]
export function deserialize<T extends object>(jsonPatch: JSONPatch): [T, Deserialize<T>] {
    return _deserialize<T>(undefined)(jsonPatch)
}

function _deserialize<T extends object>(mutable: T): (jsonPatch: JSONPatch) => [T, Deserialize<T>] {
    return (jsonPatch: JSONPatch) => {
        if (jsonPatch.length === 1 && jsonPatch[0].op === ADD && jsonPatch[0].path.length === 0) {
            mutable = mutableObject(jsonPatch[0].value) as T;
            return [mutable, _deserialize(mutable)]
        }
        if (!mutable)
            mutable = mutableObject({}) as any as T;
        if (jsonPatch.length === 1 && jsonPatch[0].path.length === 0 && jsonPatch[0].op === REPLACE)
            (mutable as MutableContract).setOriginal(jsonPatch[0].value)
        else
            patch(mutable, jsonPatch)
        return [mutable, _deserialize(mutable)]
    }
}
