import {initRevision, touchRevision} from "./revisioned";
import {setPrivateProperty} from "./private-property";

const isProxy = Symbol.for("isProxy")
const mutationListener = Symbol.for("listener")
export const originalSymbol = Symbol.for("original")
const proxySymbol = Symbol.for("proxy")
type ChangeListener = () => void;
export function isMutable(obj: any): obj is object {
    return (typeof obj === "object") && !!obj[isProxy];
}

export function addMutableListener(obj: object, changeListener: ChangeListener) {
    (obj[mutationListener] as Set<ChangeListener>).add(changeListener);
}

export function removeMutableListener(obj: object, changeListener: ChangeListener) {
    (obj[mutationListener] as Set<ChangeListener>).delete(changeListener)
}

function setProxy(obj: object, proxy: object) {
    return setPrivateProperty(obj, proxySymbol, proxy);
}

function getProxy(obj: object) {
    return obj[proxySymbol];
}

function deleteProxy(obj: object, changeListener: ChangeListener) {
    if (obj[proxySymbol]) {
        removeMutableListener(obj[proxySymbol], changeListener);
        delete obj[proxySymbol];
    }
}

function wrapArrayReturn<T>(array: Array<T>, func: Function, notifyParent?: ChangeListener): Function {
    return (...args) => _mutableObject(func.apply(array, args), notifyParent)
}

function wrapFilter<T>(array: Array<T>, func: Function, notifyParent?: ChangeListener): Function {
    return (...args) => {
        let [first, ...rest] = [...args];
        let wrappedFirst = arg => first(_mutableObject(arg, notifyParent));
        return _mutableObject(func.apply(array, [wrappedFirst, ...rest]), notifyParent)
    }
}

const wrapArrayFuncs: Map<String, (array: Array<any>, func: Function, notifyParent?: ChangeListener) => Function> = new Map([
    ['map', wrapArrayReturn],
    ['filter', wrapFilter],
    ['flatMap',  wrapArrayReturn],
    ['flat',  wrapArrayReturn]
]);

export function mutableObject<T extends object>(original: T): T
export function mutableObject<T>(original: Array<T>): Array<T> {
    return _mutableObject(original, undefined)
}

export function _mutableObject<T extends object>(original: T, notifyParent?: ChangeListener): T
export function _mutableObject<T>(original: Array<T>, notifyParent?: ChangeListener): Array<T> {
    if (typeof original !== 'object')
        return original;
    if (getProxy(original))
        return getProxy(original);
    initRevision(original)
    const arrayFunctions = {};
    const changeListeners: Set<ChangeListener> = notifyParent? new Set([notifyParent]): new Set();
    const changed = () => {
        touchRevision(original)
        changeListeners.forEach(_ => _());
    }
    for (let prop in original)
        if (typeof original[prop] === 'object' && getProxy(original[prop] as unknown as object))
            getProxy(original[prop] as unknown as object)[mutationListener].add(changed);

    return new Proxy(original, {
        deleteProperty: function(target, property) {
            deleteProxy(target[property], changed);
            delete target[property];
            changed();
            return true;
        },
        set: function(target, property, value) {
            if (target[property])
                deleteProxy(target[property], changed);
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
            else if (property === proxySymbol)
                return undefined; // this line is here for mechanisms who insist on serializing un-enumerable properties
            else if (Array.isArray(target) && typeof property === 'string' && wrapArrayFuncs.has(property)) {
                if (!arrayFunctions[property])
                    arrayFunctions[property] = wrapArrayFuncs.get(property)(target, target[property], changed);
                return arrayFunctions[property];
            }
            else if (typeof target[property] === 'object') {
                if (!getProxy(target[property]))
                    setProxy(target[property], _mutableObject(target[property], changed))
                return getProxy(target[property])
            }
            else if (target instanceof Date && typeof target[property] === 'function')
                return target[property].bind(target);
            else
                return target[property];
        }
    });
}