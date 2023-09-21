import { nextRevNum } from './revisioned';
import { setPrivateProperty } from './private-property';
import { ChangeListener, isMutable, MutableContract } from 'jay-json-patch';

export const MUTABLE_PROXY_SYMBOL = Symbol.for('proxy');

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
const _structuredClone = structuredClone;

function setProxy(obj: object, proxy: object) {
    return setPrivateProperty(obj, MUTABLE_PROXY_SYMBOL, proxy);
}

function getProxy(obj: object) {
    return obj[MUTABLE_PROXY_SYMBOL];
}

function deleteProxy(obj: object, changeListener: ChangeListener) {
    if (obj && isMutable(obj[MUTABLE_PROXY_SYMBOL]))
        obj[MUTABLE_PROXY_SYMBOL].removeMutableListener(changeListener);
    // if (obj && obj[MUTABLE_PROXY_SYMBOL]) {
    //     delete obj[MUTABLE_PROXY_SYMBOL];
    // }
}

function wrapArrayReturn<T>(state: State, property: string): Function {
    return (...args) =>
        _mutableObject(state.original[property].apply(state.original, args), state.changed);
}

function wrapFilter<T>(state: State, property: string): Function {
    return (...args) => {
        let [first, ...rest] = [...args];
        let wrappedFirst = (arg) => first(_mutableObject(arg, state.changed));
        let filteredItems = state.original[property].apply(state.original, [wrappedFirst, ...rest]);
        return _mutableObject(filteredItems);
    };
}

const WRAP_ARRAY_FUNCTIONS: Map<String, (state: State, property: string) => Function> = new Map([
    ['map', wrapArrayReturn],
    ['filter', wrapFilter],
    ['flatMap', wrapArrayReturn],
    ['flat', wrapArrayReturn],
]);

export function mutableObject<T extends object>(original: T): T & MutableContract;
export function mutableObject<T>(original: Array<T>): Array<T> & MutableContract {
    return _mutableObject(original, undefined);
}

interface State /*extends MutableContract*/ {
    proxy?: any & MutableContract;
    revNum: number;
    original: object;
    changeListeners: Set<ChangeListener>;
    functionsCache: object;
    isArray: boolean;
    changed: ChangeListener;
    frozen?: object;
}
const MUTABLE_CONTEXT_FUNCTIONS = {
    isMutable: () => () => true,
    getRevision: (state: State) => () => state.revNum,
    setRevision: (state: State) => (revNum: number) => (state.revNum = revNum),
    addMutableListener: (state: State) => (changeListener: ChangeListener) =>
        state.changeListeners.add(changeListener),
    removeMutableListener: (state: State) => (changeListener: ChangeListener) =>
        state.changeListeners.delete(changeListener),
    getOriginal: (state: State) => () => state.original,
    setOriginal: (state: State) => (newOriginal) => {
        deleteProxy(state.original, undefined);
        state.original = newOriginal;
        setProxy(state.original, state.proxy);
        state.revNum = nextRevNum();
        state.frozen = undefined;
    },
    freeze: (state) => () => {
        if (!state.frozen) {
            if (state.isArray) {
                state.frozen = state.original.map((propValue, index) =>
                    typeof propValue === 'object' ? state.proxy[index].freeze() : propValue,
                );
            } else {
                let copy = {};
                for (let prop in state.proxy) {
                    let propValue = state.proxy[prop];
                    copy[prop] =
                        typeof propValue === 'object' ? state.proxy[prop].freeze() : propValue;
                }
                state.frozen = copy;
            }
        }
        return state.frozen;
    },
};

export function _mutableObject<T extends object>(
    original: T,
    notifyParent?: ChangeListener,
): T & MutableContract;
export function _mutableObject<T>(
    original: Array<T>,
    notifyParent?: ChangeListener,
): Array<T> & MutableContract {
    if (typeof original !== 'object') return original;
    if (Object.isFrozen(original)) original = _structuredClone(original);
    if (getProxy(original)) return getProxy(original);
    let state: State = {
        revNum: nextRevNum(),
        original,
        changeListeners: notifyParent ? new Set([notifyParent]) : new Set(),
        functionsCache: {},
        isArray: Array.isArray(original),
        changed: () => {
            state.frozen = undefined;
            state.revNum = nextRevNum();
            state.changeListeners.forEach((_) => _());
        },
    };
    for (let prop in original) {
        let propValue = original[prop];
        if (typeof propValue === 'object' && getProxy(propValue as unknown as object))
            getProxy(propValue as unknown as object).addMutableListener(state.changed);
    }

    state.proxy = new Proxy(original, {
        deleteProperty: function (target, property) {
            deleteProxy(state.original[property], state.changed);
            delete state.original[property];
            state.changed();
            return true;
        },
        set: function (target, property, value) {
            if (state.original[property]) deleteProxy(state.original[property], state.changed);
            state.original[property] = isMutable(value)
                ? value.getOriginal()
                : Object.isFrozen(value)
                ? _structuredClone(value)
                : value;
            state.changed();
            return true;
        },
        get: function (target, property: PropertyKey) {
            if (MUTABLE_CONTEXT_FUNCTIONS.hasOwnProperty(property)) {
                if (!state.functionsCache[property])
                    state.functionsCache[property] = MUTABLE_CONTEXT_FUNCTIONS[property](state);
                return state.functionsCache[property];
            }
            if (property === MUTABLE_PROXY_SYMBOL)
                return undefined; // this line is here for mechanisms who insist on serializing un-enumerable properties
            else if (
                state.isArray &&
                typeof property === 'string' &&
                WRAP_ARRAY_FUNCTIONS.has(property)
            ) {
                if (!state.functionsCache[property])
                    state.functionsCache[property] = WRAP_ARRAY_FUNCTIONS.get(property)(
                        state,
                        property,
                    );
                return state.functionsCache[property];
            } else if (typeof state.original[property] === 'object') {
                if (!getProxy(state.original[property]))
                    // state.original[property] = _mutableObject(state.original[property], state.changed)
                    setProxy(
                        state.original[property],
                        _mutableObject(state.original[property], state.changed),
                    );
                return getProxy(state.original[property]);
            } else if (
                state.original instanceof Date &&
                typeof state.original[property] === 'function'
            )
                return state.original[property].bind(state.original);
            else return state.original[property];
        },
    }) as unknown as T[] & MutableContract;

    setProxy(original, state.proxy);
    return state.proxy;
}
