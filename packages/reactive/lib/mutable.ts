import {nextRevNum} from "./revisioned";
import {setPrivateProperty} from "./private-property";
import {ChangeListener, isMutable} from "./reactive-contract";

const proxySymbol = Symbol.for("proxy")

function setProxy(obj: object, proxy: object) {
    return setPrivateProperty(obj, proxySymbol, proxy);
}

function getProxy(obj: object) {
    return obj[proxySymbol];
}

function deleteProxy(obj: object, changeListener: ChangeListener) {
    if (isMutable(obj[proxySymbol]))
        obj[proxySymbol].removeMutableListener(changeListener)
    if (obj[proxySymbol]) {
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
        let filteredItems = func.apply(array, [wrappedFirst, ...rest]);
        return _mutableObject(filteredItems, notifyParent)
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

interface State /*extends MutableContract*/ {
    revNum: number,
    original: object
    changeListeners: Set<ChangeListener>
    arrayFunctions: object
}
const MUTABLE_CONTEXT_FUNCTIONS = {
    isMutable: (state: State) => () => true,
    getRevision: (state: State) => () => state.revNum,
    setRevision: (state: State) => (revNum: number) => state.revNum = revNum,
    addMutableListener: (state: State) => (changeListener: ChangeListener) => state.changeListeners.add(changeListener),
    removeMutableListener: (state: State) => (changeListener: ChangeListener) => state.changeListeners.delete(changeListener),
    getOriginal: (state: State) => () => state.original,
}

export function _mutableObject<T extends object>(original: T, notifyParent?: ChangeListener): T
export function _mutableObject<T>(original: Array<T>, notifyParent?: ChangeListener): Array<T> {
    if (typeof original !== 'object')
        return original;
    if (getProxy(original))
        return getProxy(original);
    let state: State = {
        revNum: nextRevNum(),
        original,
        changeListeners: notifyParent? new Set([notifyParent]): new Set(),
        arrayFunctions: {}
    }
    const changed = () => {
        state.revNum = nextRevNum();
        state.changeListeners.forEach(_ => _());
    }
    for (let prop in original) {
        let propValue = original[prop];
        if (typeof propValue === 'object' && getProxy(propValue as unknown as object))
            getProxy(propValue as unknown as object).addMutableListener(changed);
        }

    return new Proxy(original, {
        deleteProperty: function(target, property) {
            deleteProxy(state.original[property], changed);
            delete state.original[property];
            changed();
            return true;
        },
        set: function(target, property, value) {
            if (state.original[property])
                deleteProxy(state.original[property], changed);
            state.original[property] = isMutable(value)?value.getOriginal():value;
            changed();
            return true;
        },
        get: function(target, property: PropertyKey) {
            if (MUTABLE_CONTEXT_FUNCTIONS.hasOwnProperty(property))
                return MUTABLE_CONTEXT_FUNCTIONS[property](state);
            if (property === proxySymbol)
                return undefined; // this line is here for mechanisms who insist on serializing un-enumerable properties
            else if (Array.isArray(state.original) && typeof property === 'string' && wrapArrayFuncs.has(property)) {
                if (!state.arrayFunctions[property])
                    state.arrayFunctions[property] = wrapArrayFuncs.get(property)(state.original, state.original[property], changed);
                return state.arrayFunctions[property];
            }
            else if (typeof state.original[property] === 'object') {
                if (!getProxy(state.original[property]))
                    setProxy(state.original[property], _mutableObject(state.original[property], changed))
                return getProxy(state.original[property])
            }
            else if (state.original instanceof Date && typeof state.original[property] === 'function')
                return state.original[property].bind(state.original);
            else
                return state.original[property];
        }
    }) as unknown as T[];
}