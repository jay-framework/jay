import {ChangeListener, isMutable, nextRevNum} from "jay-reactive";
import {setPrivateProperty} from "./private-property";
import {ADD, JSONPatch, MOVE, MutableContract, REMOVE, REPLACE} from "./types";

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

function wrapArrayReturn<T>(state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener): Function {
    return (...args) => _mutableObject(state.original[property].apply(state.original, args), mkJsonPatch, notifyParent)
}

function wrapFilter<T>(state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener): Function {
    return (...args) => {
        let [first, ...rest] = [...args];
        let wrappedFirst = arg => first(_mutableObject(arg, mkJsonPatch, notifyParent));
        let filteredItems = state.original[property].apply(state.original, [wrappedFirst, ...rest]);
        return _mutableObject(filteredItems, mkJsonPatch, notifyParent)
    }
}

function suppressPatch<T>(state: State, op: () => T): T {
    try {
        state.suppressPatch = true;
        return op();
    }
    finally {
        state.suppressPatch = false;
    }
}

function wrapArrayShift<T>(state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener): Function {
    return () => {
        return suppressPatch(state, () => {
            state.original[property].apply(state.original)
            state.patch.push({op: REMOVE, path: ["0"]})
        })
    }
}

function wrapArrayUnshift<T>(state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener): Function {
    return (...args) => {
        return suppressPatch(state, () => {
            state.original[property].apply(state.original, args)
            for (let i=0; i < args.length; i++)
                state.patch.push({op: ADD, path: [""+i], value: args[i]})
        })
    }
}

function wrapArrayReverse<T>(state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener): Function {
    return () => {
        return suppressPatch(state, () => {
            state.original[property].apply(state.original)
            let from = ["" + ((state.original as Array<any>).length - 1)]
            for (let i=0; i < (state.original as Array<any>).length-1; i++)
                state.patch.push({op: MOVE, path: [""+i], from})
        })
    }
}

function wrapArraySplice<T>(state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener): Function {
    return (...args) => {
        return suppressPatch(state, () => {
            let start = args[0], remove = args[1], add = args.length - 2, replace = Math.min(remove, add);
            state.original[property].apply(state.original, args)
            for (let i=0; i < replace; i++)
                state.patch.push({op: REPLACE, path: [""+(start+i)], value: args[i+2]})
            for (let i = remove; i < add; i++)
                state.patch.push({op: ADD, path: [""+(start+i)], value: args[i+2]})
            for (let i = add; i < remove; i++)
                state.patch.push({op: REMOVE, path: [""+(start+i)]})
        })
    }
}

const WRAP_ARRAY_FUNCTIONS: Map<String, (state: State, property: string, mkJsonPatch: boolean, notifyParent?: ChangeListener) => Function> = new Map([
    ['map', wrapArrayReturn],
    ['filter', wrapFilter],
    ['flatMap',  wrapArrayReturn],
    ['flat',  wrapArrayReturn],
    ['shift', wrapArrayShift],
    ['splice', wrapArraySplice],
    ['reverse', wrapArrayReverse],
    ['unshift', wrapArrayUnshift]
]);

export function mutableObject<T extends object>(original: T, mkJsonPatch?: boolean): T & MutableContract
export function mutableObject<T>(original: Array<T>, mkJsonPatch?: boolean): Array<T> & MutableContract {
    return _mutableObject(original, mkJsonPatch, undefined)
}

interface State /*extends MutableContract*/ {
    revNum: number,
    original: object
    changeListeners: Set<ChangeListener>
    arrayFunctions: object,
    patch: JSONPatch,
    isArray: boolean
    suppressPatch: boolean;
}
const MUTABLE_CONTEXT_FUNCTIONS = {
    isMutable: (state: State) => () => true,
    getRevision: (state: State) => () => state.revNum,
    setRevision: (state: State) => (revNum: number) => state.revNum = revNum,
    addMutableListener: (state: State) => (changeListener: ChangeListener) => state.changeListeners.add(changeListener),
    removeMutableListener: (state: State) => (changeListener: ChangeListener) => state.changeListeners.delete(changeListener),
    getOriginal: (state: State) => () => state.original,
    getPatch: (state: State) => () => {
        let patch = state.patch;
        state.patch = []
        return patch
    }
}

export function _mutableObject<T extends object>(original: T, mkJsonPatch: boolean, notifyParent?: ChangeListener): T & MutableContract
export function _mutableObject<T>(original: Array<T>, mkJsonPatch: boolean, notifyParent?: ChangeListener): Array<T> & MutableContract{
    if (typeof original !== 'object')
        return original;
    if (getProxy(original))
        return getProxy(original);
    let state: State = {
        revNum: nextRevNum(),
        original,
        changeListeners: notifyParent? new Set([notifyParent]): new Set(),
        arrayFunctions: {},
        patch: [],
        isArray: Array.isArray(original),
        suppressPatch:  false
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
            if ( mkJsonPatch && typeof property === 'string' && !state.suppressPatch)
                state.patch.push({op: REMOVE, path: [property]})
            delete state.original[property];
            changed();
            return true;
        },
        set: function(target, property, value) {
            if (state.original[property])
                deleteProxy(state.original[property], changed);
            if ( mkJsonPatch && typeof property === 'string' && (!state.isArray || property !== "length") && !state.suppressPatch)
                state.patch.push({op: state.original[property]?REPLACE:ADD, path: [property], value})
            state.original[property] = isMutable(value)?value.getOriginal():value;
            changed();
            return true;
        },
        get: function(target, property: PropertyKey) {
            if (MUTABLE_CONTEXT_FUNCTIONS.hasOwnProperty(property))
                return MUTABLE_CONTEXT_FUNCTIONS[property](state);
            if (property === proxySymbol)
                return undefined; // this line is here for mechanisms who insist on serializing un-enumerable properties
            else if (state.isArray && typeof property === 'string' && WRAP_ARRAY_FUNCTIONS.has(property)) {
                if (!state.arrayFunctions[property])
                    state.arrayFunctions[property] = WRAP_ARRAY_FUNCTIONS.get(property)(state, property, mkJsonPatch, changed);
                return state.arrayFunctions[property];
            }
            else if (typeof state.original[property] === 'object') {
                if (!getProxy(state.original[property]))
                    setProxy(state.original[property], _mutableObject(state.original[property], mkJsonPatch, changed))
                return getProxy(state.original[property])
            }
            else if (state.original instanceof Date && typeof state.original[property] === 'function')
                return state.original[property].bind(state.original);
            else
                return state.original[property];
        }
    }) as unknown as T[] & MutableContract;
}