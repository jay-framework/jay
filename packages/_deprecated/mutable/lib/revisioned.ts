import { isMutable } from 'jay-mutable-contract';

let nextRevision = 1;

export interface Revisioned<T> {
    value: T;
    revNum: number;
}

export function getRevision<T extends object>(value: T): Revisioned<T> {
    return { value, revNum: isMutable(value) ? value.getRevision() : NaN };
}

export function setRevision<T extends object>(value: T, revision: number) {
    isMutable(value) && value.setRevision(revision);
}

function getRevNum(value: any) {
    return isMutable(value) ? value.getRevision() : NaN;
}

export function nextRevNum(): number {
    return nextRevision++;
}

export function touchRevision<T extends object>(value: T): T {
    setRevision(value, nextRevNum());
    return value;
}

export function checkModified<T>(value: T, oldValue?: Revisioned<T>): [Revisioned<T>, boolean] {
    let isObject = typeof value === 'object';
    let revNum = getRevNum(value);
    let newValue = { value, revNum };
    if (!oldValue) return [newValue, true];
    else {
        let modified = Number.isNaN(revNum) ? value !== oldValue.value : revNum !== oldValue.revNum;
        return [newValue, modified];
    }
}
