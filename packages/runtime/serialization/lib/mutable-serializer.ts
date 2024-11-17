import { ArrayContexts, diff } from 'jay-json-patch';
import { JSONPatch } from 'jay-json-patch';

export type Serialize<T extends object> = (
    entity: any,
    contexts?: ArrayContexts,
) => [JSONPatch, Serialize<T>];

export function serialize<T extends object>(
    entity: any,
    contexts?: ArrayContexts,
): [JSONPatch, Serialize<T>] {
    return _serialize(undefined, contexts)(entity);
}

export function _serialize<T extends object>(
    lastEntity: T,
    contexts?: ArrayContexts,
): (entity: T) => [JSONPatch, Serialize<T>] {
    return (entity: T) => {
        let patch = diff(entity, lastEntity, contexts);
        return [patch[0], _serialize(entity, contexts)];
    };
}
