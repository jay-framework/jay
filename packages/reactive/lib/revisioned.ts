

export const REVISION = Symbol.for('revision');
let nextRevision = 1;

export interface Revisioned<T> {
    value: T,
    revNum: number
}

export function getRevision<T extends object>(value: T): Revisioned<T> {
    return {value, revNum: value[REVISION] || NaN};
}

export function setRevision<T extends object>(value: T, revision: number): T {
    if (!Object.getOwnPropertyDescriptor(value, REVISION))
        Object.defineProperty(value, REVISION, {
            value: revision,
            enumerable: false,
            writable: true
        });
    else
        value[REVISION] = revision;
    return value
}

export function touchRevision<T extends object>(value: T): T {
    return setRevision(value, nextRevision++);
}

export function checkModified<T>(value: T, oldValue?: Revisioned<T>): [Revisioned<T>, boolean] {
    let isObject = typeof value === 'object';
    let revNum = isObject? value[REVISION] || NaN : NaN;
    let newValue = {value, revNum};
    if (!oldValue)
        return [newValue, true]
    else {
        let modified = Number.isNaN(revNum)?
            value !== oldValue.value :
            revNum !== oldValue.revNum
        return [newValue, modified]
    }
}