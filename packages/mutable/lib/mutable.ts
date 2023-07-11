import {nextRevNum} from "jay-reactive";
import {setPrivateProperty} from "./private-property";
import {ADD, ChangeListener, isMutable, JSONPatch, MOVE, MutableContract, REMOVE, REPLACE} from "jay-mutable-contract";

export const MUTABLE_PROXY_SYMBOL = Symbol.for("proxy")

/* using `structuredClone` in `jest` tests requires add `jest.config.js` with the following config
const config = {
  testEnvironment: "node",
  globals: {
    structuredClone: structuredClone,
  },
};
module.exports = config;

we introduce the const here to enable minification of the function name
*/
const _structuredClone = structuredClone

function setProxy(obj: object, proxy: object) {
    return setPrivateProperty(obj, MUTABLE_PROXY_SYMBOL, proxy);
}

function getProxy(obj: object) {
    return obj[MUTABLE_PROXY_SYMBOL];
}

function deleteProxy(obj: object, changeListener: ChangeListener) {
    if (isMutable(obj[MUTABLE_PROXY_SYMBOL]))
        obj[MUTABLE_PROXY_SYMBOL].removeMutableListener(changeListener)
    if (obj[MUTABLE_PROXY_SYMBOL]) {
        delete obj[MUTABLE_PROXY_SYMBOL];
    }
}

function wrapArrayReturn<T>(state: State, property: string, mkJsonPatch: boolean): Function {
    return (...args) => _mutableObject(state.original[property].apply(state.original, args), mkJsonPatch, state.changed)
}

function wrapFilter<T>(state: State, property: string, mkJsonPatch: boolean): Function {
    return (...args) => {
        let [first, ...rest] = [...args];
        let wrappedFirst = arg => first(_mutableObject(arg, mkJsonPatch, state.changed));
        let filteredItems = state.original[property].apply(state.original, [wrappedFirst, ...rest]);
        return _mutableObject(filteredItems, mkJsonPatch)
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

function wrapArrayShift<T>(state: State, property: string, mkJsonPatch: boolean): Function {
    if (!mkJsonPatch)
        return (state.original as Array<any>).shift
    else
        return () => {
            return suppressPatch(state, () => {
                let res = (state.original as Array<any>).shift.apply(state.original)
                state.changed();
                state.patch.push({op: REMOVE, path: ["0"]})
                return res;
            })
        }
}

function wrapArrayUnshift<T>(state: State, property: string, mkJsonPatch: boolean): Function {
    if (!mkJsonPatch)
        return (state.original as Array<any>).unshift
    else
        return (...args) => {
            return suppressPatch(state, () => {
                let res = (state.original as Array<any>).unshift.apply(state.original, args)
                state.changed();
                for (let i=0; i < args.length; i++)
                    state.patch.push({op: ADD, path: [""+i], value: _structuredClone(args[i])})
                return res;
            })
        }
}

function wrapArrayReverse<T>(state: State, property: string, mkJsonPatch: boolean): Function {
    if (!mkJsonPatch)
        return (state.original as Array<any>).reverse
    else
        return () => {
            return suppressPatch(state, () => {
                (state.original as Array<any>).reverse.apply(state.original)
                state.changed();
                let from = ["" + ((state.original as Array<any>).length - 1)]
                for (let i=0; i < (state.original as Array<any>).length-1; i++)
                    state.patch.push({op: MOVE, path: [""+i], from})
                return state.proxy;
            })
        }
}

function wrapArraySplice<T>(state: State, property: string, mkJsonPatch: boolean): Function {
    if (!mkJsonPatch)
        return (state.original as Array<any>).splice
    else
        return (...args) => {
            return suppressPatch(state, () => {
                let start = args[0], remove = args[1], add = args.length - 2, replace = Math.min(remove, add);
                (state.original as Array<any>).splice.apply(state.original, args)
                state.changed();
                for (let i=0; i < replace; i++)
                    state.patch.push({op: REPLACE, path: [""+(start+i)], value: _structuredClone(args[i+2])})
                for (let i = remove; i < add; i++)
                    state.patch.push({op: ADD, path: [""+(start+i)], value: _structuredClone(args[i+2])})
                for (let i = add; i < remove; i++)
                    state.patch.push({op: REMOVE, path: [""+(start+i)]})
            })
        }
}

const WRAP_ARRAY_FUNCTIONS: Map<String, (state: State, property: string, mkJsonPatch: boolean) => Function> = new Map([
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
    proxy?: any & MutableContract;
    revNum: number,
    original: object
    changeListeners: Set<ChangeListener>
    arrayFunctions: object,
    patch: JSONPatch,
    isArray: boolean
    suppressPatch: boolean;
    changed: ChangeListener
}
const MUTABLE_CONTEXT_FUNCTIONS = {
    isMutable: (state: State) => () => true,
    getRevision: (state: State) => () => state.revNum,
    setRevision: (state: State) => (revNum: number) => state.revNum = revNum,
    addMutableListener: (state: State) => (changeListener: ChangeListener) => state.changeListeners.add(changeListener),
    removeMutableListener: (state: State) => (changeListener: ChangeListener) => state.changeListeners.delete(changeListener),
    getOriginal: (state: State) => () => state.original,
    setOriginal: (state: State) => (newOriginal) => {
        deleteProxy(state.original, undefined);
        state.original = newOriginal
        setProxy(state.original, state.proxy)
    },
}

const getPatch = (state: State) => () => {
    let patches = [state.patch];
    for (let prop in state.original) {
        let childMutableProxy = getProxy(state.original[prop]);
        if (childMutableProxy)
            patches.push(childMutableProxy.getPatch()
                .map(patchOperation => {
                    patchOperation.path.unshift(prop);
                    if (patchOperation.from)
                        patchOperation.from.unshift(prop);
                    return patchOperation;
                }))
    }
    state.patch = []
    return patches.flat()
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
        suppressPatch:  false,
        changed: () => {
            state.revNum = nextRevNum();
            state.changeListeners.forEach(_ => _());
        }
    }
    for (let prop in original) {
        let propValue = original[prop];
        if (typeof propValue === 'object' && getProxy(propValue as unknown as object))
            getProxy(propValue as unknown as object).addMutableListener(state.changed);
        }

    state.proxy = new Proxy(original, {
        deleteProperty: function(target, property) {
            deleteProxy(state.original[property], state.changed);
            if ( mkJsonPatch && typeof property === 'string' && !state.suppressPatch)
                state.patch.push({op: REMOVE, path: [property]})
            delete state.original[property];
            state.changed();
            return true;
        },
        set: function(target, property, value) {
            if (state.original[property])
                deleteProxy(state.original[property], state.changed);
            if ( mkJsonPatch && typeof property === 'string' && (!state.isArray || property !== "length") && !state.suppressPatch)
                state.patch.push({op: state.original[property]?REPLACE:ADD, path: [property], value: _structuredClone(value)})
            state.original[property] = isMutable(value)?value.getOriginal():value;
            state.changed();
            return true;
        },
        get: function(target, property: PropertyKey) {
            if (MUTABLE_CONTEXT_FUNCTIONS.hasOwnProperty(property))
                return MUTABLE_CONTEXT_FUNCTIONS[property](state);
            if (property === 'getPatch' && mkJsonPatch)
                return getPatch(state);
            else if (property === MUTABLE_PROXY_SYMBOL)
                return undefined; // this line is here for mechanisms who insist on serializing un-enumerable properties
            else if (state.isArray && typeof property === 'string' && WRAP_ARRAY_FUNCTIONS.has(property)) {
                if (!state.arrayFunctions[property])
                    state.arrayFunctions[property] = WRAP_ARRAY_FUNCTIONS.get(property)(state, property, mkJsonPatch);
                return state.arrayFunctions[property];
            }
            else if (typeof state.original[property] === 'object') {
                if (!getProxy(state.original[property]))
                    setProxy(state.original[property], _mutableObject(state.original[property], mkJsonPatch, state.changed))
                return getProxy(state.original[property])
            }
            else if (state.original instanceof Date && typeof state.original[property] === 'function')
                return state.original[property].bind(state.original);
            else
                return state.original[property];
        }
    }) as unknown as T[] & MutableContract;

    setProxy(original, state.proxy)
    return state.proxy;
}