import {touchRevision} from "./revisioned";

const isProxy = Symbol("isProxy")
const mutationListener = Symbol("listener")
export function isMutable(obj: any): obj is object {
    return (typeof obj === "object") && !!obj[isProxy];
}

export function addMutableListener(obj: object, listener: () => void) {
    obj[mutationListener](listener, true);
}

export function removeMutableListener(obj: object, listener: () => void) {
    obj[mutationListener](listener, false)
}

export function mutableObject<T extends object>(original: T, notifyParent?: () => void): T
export function mutableObject<T>(original: Array<T>, notifyParent?: () => void): Array<T> {
    touchRevision(original);
    const childRefs = new WeakMap();
    const childChanged = () => changed();
    const changeListeners: Set<() => void> = notifyParent? new Set([notifyParent]): new Set();
    const changed = () => {
        touchRevision(original)
        changeListeners.forEach(_ => _());
    }
    const addRemoveChangeListener = (listener, add: boolean) => {
        if (add)
            changeListeners.add(listener);
        else
            changeListeners.delete(listener);
    }
    return new Proxy(original, {
        deleteProperty: function(target, property) {
            delete target[property];
            childRefs.delete(target[property]);
            changed();
            return true;
        },
        set: function(target, property, value) {
            target[property] = value;
            changed();
            return true;
        },
        get: function(target, property: PropertyKey) {
            if (property === isProxy)
                return true;
            else if (property === mutationListener)
                return addRemoveChangeListener;
            else if (typeof target[property] === 'object') {
                if (!childRefs.get(target[property]))
                    childRefs.set(target[property], mutableObject(target[property], childChanged))
                return childRefs.get(target[property])
            }
            else
                return target[property];
        }
    });
}