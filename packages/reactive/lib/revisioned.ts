// import {setPrivateProperty} from "./private-property";
import {isMutable} from "./reactive-contract";

// export const REVISION = Symbol.for('revision');
let nextRevision = 1;

export interface Revisioned<T> {
    value: T,
    revNum: number
}

export function getRevision<T extends object>(value: T): Revisioned<T> {
    return {value, revNum: isMutable(value)?value.getRevision(): NaN};
}

export function setRevision<T extends object>(value: T, revision: number) {
    isMutable(value) && value.setRevision(revision);
}

function getRevNum(value: any) {
    return isMutable(value)?value.getRevision(): NaN;
}

// export function initRevision<T extends object>(value: T): T {
//     return value[REVISION]?value:touchRevision(value)
// }

export function touchRevision<T extends object>(value: T): T {
    setRevision(value, nextRevision++);
    return value;
}

export function checkModified<T>(value: T, oldValue?: Revisioned<T>): [Revisioned<T>, boolean] {
    let isObject = typeof value === 'object';
    let revNum = getRevNum(value);
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