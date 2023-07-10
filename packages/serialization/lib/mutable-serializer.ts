import {JSONPatch} from "./types";
import {diff} from "./serialize/diff";
import {isMutable} from "jay-reactive";
import {MutableContract} from "jay-mutable";


export type Serialize = (entity: any) => [JSONPatch, Serialize]

export function serialize(entity: any): [JSONPatch, Serialize] {
    return _serialize(undefined)(entity);
}

export function _serialize<T>(lastEntity: T): (entity: T) => [JSONPatch, Serialize] {
    return (entity: T) => {
        // special case - immutable object with a direct mutable child
        let copy: any = {}
        if (typeof entity === 'object' && !Array.isArray(entity) && !isMutable(entity)) {
            for (let prop in entity) {
                let value = entity[prop];
                if (isMutable(value))
                    copy[prop] = structuredClone(value.getOriginal())
                else
                    copy[prop] = value;
            }
        }
        else
            copy = entity;
        let patch = diff(copy, lastEntity)
        return [patch[0], _serialize(copy)]
    }
}