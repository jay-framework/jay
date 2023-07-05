import {ITEM_ADDED, ITEM_MOVED, listCompare, RandomAccessLinkedList as List} from "jay-list-compare";

export const ADD = "add"
export const REPLACE = "replace"
export const REMOVE = "remove"
export const MOVE = "move"
type JSONPointer = string[]

interface JSONPatchAdd {
    op: typeof ADD,
    path: JSONPointer,
    value: any
}
interface JSONPatchReplace {
    op: typeof REPLACE,
    path: JSONPointer,
    value: any
}
interface JSONPatchRemove {
    op: typeof REMOVE,
    path: JSONPointer,
}
interface JSONPatchMove {
    op: typeof MOVE,
    from: JSONPointer,
    path: JSONPointer
}
type JSONPatchOperation = JSONPatchAdd | JSONPatchReplace | JSONPatchRemove | JSONPatchMove;
type JSONPatch = JSONPatchOperation[]
type MeasureOfChange = number
type DataFields = number
type ArrayContext = {
    matchBy: string,
    lastArray: List<any, any>,
}
type ArrayContexts = [JSONPointer, ArrayContext][]

function findArrayContext(contexts: ArrayContexts, path: JSONPointer): ArrayContext {
    let foundContext = contexts?.find(([pointer, context]) => {
        return path.length === pointer.length && path.reduce((prev, curr, index) => {
            return prev && (curr === '*')? true : curr === path[index]
        }, true)
    })
    return foundContext?foundContext[1]:undefined;
}

function diffObject(newValue: unknown, oldValue: unknown, diffResults: [JSONPatch, MeasureOfChange, DataFields][], contexts: ArrayContexts, path: string[]) {
    let keys, i, length
    keys = Object.keys(newValue);
    let oldKeys = Object.keys(oldValue);
    length = keys.length;
    for (i = length; i-- !== 0;) {
        const key = keys[i];
        diffResults.push(diff((newValue as Record<string, unknown>)[key], (oldValue as Record<string, unknown>)[key], contexts, [...path, key]))
    }
    for (i = oldKeys.length; i-- !== 0;) {
        const key = oldKeys[i];
        if (!newValue[key])
            diffResults.push([[{op: REMOVE, path: [...path, key]}], 1, 1])
    }
}

export const diff = (newValue: unknown, oldValue: unknown, contexts?: ArrayContexts, path: JSONPointer = []): [JSONPatch, MeasureOfChange, DataFields] => {
    // Primitives
    if (newValue === oldValue) return [[], 0, 1];
    if (oldValue === undefined || oldValue === null)
        return [[{op:ADD, path, value: newValue}], 1, 1]

    if (newValue && oldValue && typeof newValue === 'object' && typeof oldValue === 'object') {
        // Arrays
        let length, i, keys, diffResults: [JSONPatch, MeasureOfChange, DataFields][] = [];
        if (Array.isArray(newValue) && Array.isArray(oldValue)) {
            let context = findArrayContext(contexts, path);
            if (context) {
                let {matchBy, lastArray} = context;
                lastArray = lastArray || new List<any, any>(oldValue, matchBy);
                let newArray = new List<any, any>(newValue, matchBy);
                let instructions = listCompare<any, any>(lastArray, newArray, () => {})
                let arrayPatch: JSONPatch = instructions.map(instruction => {
                    if (instruction.action === ITEM_ADDED)
                        return {op: ADD, value: instruction.item, path: [...path, instruction.pos]}
                    else if (instruction.action === ITEM_MOVED)
                        return {op: MOVE, from: [...path, instruction.fromPos], path: [...path, instruction.pos]}
                    else
                        return {op: REMOVE, path: [...path, instruction.pos]}
                }) as JSONPatch;
                return [arrayPatch, instructions.length, newValue.length]
            }
        }
        if (Array.isArray(newValue) !== Array.isArray(oldValue))
            return [[{op: REPLACE, path, value:newValue}], 1, 1];

        // Objects
        diffObject(newValue, oldValue, diffResults, contexts, path);
        // check it there are a lot of diffs, better to just replace the whole object
        let [measureOfChange, dataFields] = diffResults.reduce((prev, curr) =>
             [prev[0] + curr[1], prev[1] + curr[2]], [0,0])
        if (measureOfChange / dataFields > 0.5)
            return [[{op:REPLACE, path, value:newValue}], 1, 1]
        else
            return [diffResults.map(_ => _[0]).flat(), measureOfChange, dataFields];

    }

    return [[{op: REPLACE, path, value:newValue}], 1, 1];
};