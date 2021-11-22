import {touchRevision} from "./revisioned";

const isProxy = Symbol("isProxy")
const mutationListener = Symbol("listener")
const originalSymbol = Symbol("original")
export function isMutable(obj: any): obj is object {
    return (typeof obj === "object") && !!obj[isProxy];
}

export function addMutableListener(obj: object, listener: () => void) {
    obj[mutationListener](listener, true);
}

export function removeMutableListener(obj: object, listener: () => void) {
    obj[mutationListener](listener, false)
}

function wrapCreateArrayFunction<T>(array: Array<T>, func: Function): Function {
    return (...args) => mutableObject(func.apply(array, args))
}

export function mutableObject<T extends object>(original: T, notifyParent?: () => void): T
export function mutableObject<T>(original: Array<T>, notifyParent?: () => void): Array<T> {
    touchRevision(original);
    const childRefs = new WeakMap();
    const arrayFunctions = {};
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
            target[property] = isMutable(value)?value[originalSymbol]:value;
            changed();
            return true;
        },
        get: function(target, property: PropertyKey) {
            if (property === isProxy)
                return true;
            else if (property === mutationListener)
                return addRemoveChangeListener;
            else if (property === originalSymbol)
                return original;
            else if (Array.isArray(target) && (property === 'map' || property === 'filter' || property === 'reverse')) {
                if (!arrayFunctions[property])
                    arrayFunctions[property] = wrapCreateArrayFunction(target, target[property]);
                return arrayFunctions[property];
            }
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