import {touchRevision} from "./revisioned";

const isProxy = Symbol("isProxy")
const mutationListener = Symbol("listener")
const originalSymbol = Symbol("original")
const proxySymbol = Symbol("proxy")
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
    if (!Object.getOwnPropertyDescriptor(obj, proxySymbol))
        Object.defineProperty(obj, proxySymbol, {
            value: proxy,
            enumerable: false,
            configurable: true,
            writable: true
        });
    else
        obj[proxySymbol] = proxy;
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
    return (...args) => mutableObject(func.apply(array, args), notifyParent)
}

function wrapFilter<T>(array: Array<T>, func: Function, notifyParent?: ChangeListener): Function {
    return (...args) => {
        let [first, ...rest] = [...args];
        let wrappedFirst = arg => first(mutableObject(arg, notifyParent));
        return mutableObject(func.apply(array, [wrappedFirst, ...rest]), notifyParent)
    }
}

const wrapArrayFuncs: Map<String, (array: Array<any>, func: Function, notifyParent?: ChangeListener) => Function> = new Map([
    ['map', wrapArrayReturn],
    ['filter', wrapFilter],
    ['flatMap',  wrapArrayReturn],
    ['flat',  wrapArrayReturn]
]);

export function mutableObject<T extends object>(original: T, notifyParent?: ChangeListener): T
export function mutableObject<T>(original: Array<T>, notifyParent?: ChangeListener): Array<T> {
    if (typeof original !== 'object')
        return original;
    if (getProxy(original))
        return getProxy(original);
    touchRevision(original);
    const arrayFunctions = {};
    const changeListeners: Set<ChangeListener> = notifyParent? new Set([notifyParent]): new Set();
    const changed = () => {
        touchRevision(original)
        changeListeners.forEach(_ => _());
    }
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
            else if (Array.isArray(target) && typeof property === 'string' && wrapArrayFuncs.has(property)) {
                if (!arrayFunctions[property])
                    arrayFunctions[property] = wrapArrayFuncs.get(property)(target, target[property], changed);
                return arrayFunctions[property];
            }
            else if (typeof target[property] === 'object') {
                if (!getProxy(target[property]))
                    setProxy(target[property], mutableObject(target[property], changed))
                return getProxy(target[property])
            }
            else
                return target[property];
        }
    });
}