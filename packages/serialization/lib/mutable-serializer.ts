import { ArrayContexts, diff } from 'jay-json-patch';
import { JSONPatch } from 'jay-json-patch';

export type Serialize = (entity: any, contexts?: ArrayContexts) => [JSONPatch, Serialize];

export function serialize(entity: any, contexts?: ArrayContexts): [JSONPatch, Serialize] {
    return _serialize(undefined, contexts)(entity);
}

export function _serialize<T>(
    lastEntity: T,
    contexts?: ArrayContexts,
): (entity: T) => [JSONPatch, Serialize] {
    return (entity: T) => {
        let patch = diff(entity, lastEntity, contexts);
        return [patch[0], _serialize(entity, contexts)];
    };
}
