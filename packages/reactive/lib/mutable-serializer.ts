import {isMutable, originalSymbol} from "./mutable";
import {getRevision, REVISION} from "./revisioned";
import {ARRAY, NOT_CHANGED, PROP_TO_REV, REVNUM} from "./serialize-consts";
import {setPrivateProperty} from "./private-property";

export type Serialize = (mutable: any) => [string, Serialize]

function replacer(key: string, value: any) {
    if (isMutable(value)) {
        let revisioned = getRevision(value)
        let newValue = {}
        newValue[REVNUM] = revisioned.revNum
        let propToRev = value[PROP_TO_REV];
        let newPropToRev = {}
        if (Array.isArray(value)) {

        }
        else {
            for (let prop of Object.keys(value)) {
                if (propToRev[prop] === value[prop][REVISION])
                    newValue[prop] = NOT_CHANGED
                else
                    newValue[prop] = value[prop]
                // newPropToRev[prop] =
            }
        }
        // let newValue = {...value}
        if (Array.isArray(value)) {
            newValue[ARRAY] = true;
        }
        return newValue;
    }
    else
        return value;
}

function serializeEntity(entity: any): any {
    let type = typeof entity;
    if (type === 'object') {
        if (Array.isArray(entity)) {
            let newValue = {}
            newValue[ARRAY] = true;
            if (isMutable(entity)) {
                let revisioned = getRevision(entity)
                newValue[REVNUM] = revisioned.revNum
            }
            for (let prop of Object.keys(entity)) {
                newValue[prop] = serializeEntity(entity[prop])
            }
            return JSON.stringify(newValue);
        }
        else {
            let newValue = {}
            if (isMutable(entity)) {
                let newPropToRev = {}
                let revisioned = getRevision(entity)
                newValue[REVNUM] = revisioned.revNum
                let propToRev = entity[PROP_TO_REV] || {};
                for (let prop of Object.keys(entity)) {
                    let entityPropValue = entity[prop];
                    if (isMutable(entityPropValue)) {
                        let propRevisioned = getRevision(entityPropValue);
                        if (propToRev[prop] === propRevisioned.revNum)
                            newValue[prop] = NOT_CHANGED
                        else
                            newValue[prop] = serializeEntity(entityPropValue)
                        newPropToRev[prop] = propRevisioned.revNum;
                    }
                    else
                        newValue[prop] = serializeEntity(entityPropValue)
                }
                setPrivateProperty(entity[originalSymbol], PROP_TO_REV, newPropToRev)
            }
            else {
                for (let prop of Object.keys(entity)) {
                    newValue[prop] = serializeEntity(entity[prop])
                }
            }
            return newValue;
        }
    }
    else return entity;
}

export function serialize(mutable: any): [string, Serialize] {
    return [JSON.stringify(serializeEntity(mutable)), serialize]
}