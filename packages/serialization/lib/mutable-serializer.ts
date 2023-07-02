import {getRevision} from "jay-reactive";
import {ARRAY, REVNUM} from "./serialize-consts";
import {isMutable} from "jay-reactive";

export type Serialize = (mutable: any) => [string, Serialize]

function replacer(key: string, value: any) {
    if (isMutable(value)) {
        let revisioned = getRevision(value)
        let newValue = {...value}
        newValue[REVNUM] = revisioned.revNum
        if (Array.isArray(value)) {
            newValue[ARRAY] = true;
        }
        return newValue;
    }
    else
        return value;
}

export function serialize(mutable: any): [string, Serialize] {
    return [JSON.stringify(mutable, replacer), serialize]
}