import {touchRevision} from "./revisioned";

const isProxy = Symbol("isProxy")
const mutationListener = Symbol("listener")
const originalSymbol = Symbol("original")
type ChangeListener = () => void;
export function isMutable(obj: any): obj is object {
    return (typeof obj === "object") && !!obj[isProxy];
}

export function addMutableListener(obj: object, listener: ChangeListener) {
    (obj[mutationListener] as Set<ChangeListener>).add(listener);
}

export function removeMutableListener(obj: object, listener: ChangeListener) {
    (obj[mutationListener] as Set<ChangeListener>).delete(listener)
}

function wrapCreateArrayFunction<T>(array: Array<T>, func: Function, notifyParent?: ChangeListener): Function {
    return (...args) => mutableObject(func.apply(array, args), notifyParent)
}

export function mutableObject<T extends object>(original: T, notifyParent?: ChangeListener): T
export function mutableObject<T>(original: Array<T>, notifyParent?: ChangeListener): Array<T> {
    touchRevision(original);
    const childRefs = new WeakMap();
    const arrayFunctions = {};
    const changeListeners: Set<ChangeListener> = notifyParent? new Set([notifyParent]): new Set();
    const changed = () => {
        touchRevision(original)
        changeListeners.forEach(_ => _());
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
                return changeListeners;
            else if (property === originalSymbol)
                return original;
            else if (Array.isArray(target) && (property === 'map' || property === 'filter' || property === 'flatMap' || property === 'flat')) {
                if (!arrayFunctions[property])
                    arrayFunctions[property] = wrapCreateArrayFunction(target, target[property], changed);
                return arrayFunctions[property];
            }
            else if (typeof target[property] === 'object') {
                if (!childRefs.get(target[property]))
                    childRefs.set(target[property], mutableObject(target[property], changed))
                return childRefs.get(target[property])
            }
            else
                return target[property];
        }
    });
}