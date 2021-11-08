

export const REVISION = Symbol('revision');
let nextRevision = 1;

export interface Revisioned<T> {
    value: T,
    revision: number
}

export function touchRevision<T extends object>(value: T): T {
    value[REVISION] = nextRevision++;
    return value
}

export function checkModified<T>(value: T, oldValue?: Revisioned<T>): [Revisioned<T>, boolean] {
    let isObject = typeof value === 'object';
    let revision = isObject? value[REVISION] || NaN : NaN;
    let newValue = {value, revision};
    if (!oldValue)
        return [newValue, true]
    else {
        let modified = Number.isNaN(revision)?
            value !== oldValue.value :
            revision !== oldValue.revision
        return [newValue, modified]
    }
}