

export const REVISION = Symbol('revision');
let nextRevision = 1;
export const CHILDRENREVISION = Symbol('children-revision')

interface Revisioned<T> {
    value: T,
    revision: number
}

export function updateNewRevision<T extends object>(value: T): T {
    value[REVISION] = nextRevision++;
    return value
}

export function checkModified<T>(value: T, oldValue?: Revisioned<T>): [Revisioned<T>, boolean] {
    let isObject = typeof value === 'object';
    if (!isObject && value === oldValue?.value)
        return [oldValue, false];

    let revision = isObject? value[REVISION] || NaN : NaN;

    if (!oldValue)
        return [{value, revision}, true]
    else if (isObject) {
        let modified = Number.isNaN(revision)?
            value !== oldValue.value :
            revision !== oldValue.revision
        return [{value, revision}, modified]
    }
    else
        return [{value, revision}, true]
}