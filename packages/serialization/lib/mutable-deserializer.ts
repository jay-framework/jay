import {ADD, JSONPatch, REPLACE} from "jay-json-patch";
import {patch} from "jay-json-patch";

export type Deserialize<T extends object> = (jsonPatch: JSONPatch) => [T, Deserialize<T>]
export function deserialize<T extends object>(jsonPatch: JSONPatch): [T, Deserialize<T>] {
    return _deserialize<T>(undefined)(jsonPatch)
}

function _deserialize<T extends object>(obj: T): (jsonPatch: JSONPatch) => [T, Deserialize<T>] {
    return (jsonPatch: JSONPatch) => {
        if (jsonPatch.length === 1 && jsonPatch[0].path.length === 0 && (jsonPatch[0].op === ADD || jsonPatch[0].op === REPLACE)) {
            obj = jsonPatch[0].value as T;
            return [obj, _deserialize(obj)]
        }
        if (!obj)
            obj = {} as any as T;
        let newObj = patch(obj, jsonPatch)
        return [newObj as T, _deserialize(newObj)]
    }
}
