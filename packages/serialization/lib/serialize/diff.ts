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

export const diff = (newValue: unknown, oldValue: unknown, path: JSONPointer = []): [JSONPatch, MeasureOfChange, DataFields] => {
    // Primitives
    if (newValue === oldValue) return [[], 0, 1];
    if (oldValue === undefined || oldValue === null)
        return [[{op:ADD, path, value: newValue}], 1, 1]

    if (newValue && oldValue && typeof newValue === 'object' && typeof oldValue === 'object') {
        // Arrays
        let length, i, keys, diffResults: [JSONPatch, MeasureOfChange, DataFields][] = [];
        if (Array.isArray(newValue)) {
            // length = newValue.length;
            // if (length !== (oldValue as Array<unknown>).length) return false;
            // for (i = length; i-- !== 0; )
            //     if (!deepEqual(newValue[i], (oldValue as Array<unknown>)[i])) return false;
            // return true;
        }

        // Objects
        keys = Object.keys(newValue);
        let oldKeys = Object.keys(oldValue);
        length = keys.length;
        for (i = length; i-- !== 0; ) {
            const key = keys[i];
            diffResults.push(diff((newValue as Record<string, unknown>)[key], (oldValue as Record<string, unknown>)[key], [...path, key]))
        }
        for (i = oldKeys.length; i-- !== 0; ) {
            const key = oldKeys[i];
            if (!newValue[key])
                diffResults.push([[{op:REMOVE, path: [...path, key]}], 1, 1])
        }
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