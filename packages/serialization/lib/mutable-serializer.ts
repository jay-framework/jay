import {JSONPatch} from "./types";
import {diff} from "./serialize/diff";


export type Serialize = (entity: any) => [JSONPatch, Serialize]

export function serialize(entity: any): [JSONPatch, Serialize] {
    return _serialize(undefined)(entity);
}

export function _serialize<T>(lastEntity: T): (entity: T) => [JSONPatch, Serialize] {
    return (entity: T) => {
        let patch = diff(entity, lastEntity)
        return [patch[0], serialize]
    }
}