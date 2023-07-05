export const ADD = "add"
export const REPLACE = "replace"
export const REMOVE = "remove"
export const MOVE = "move"
export type JSONPointer = string[]

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

export type JSONPatchOperation = JSONPatchAdd | JSONPatchReplace | JSONPatchRemove | JSONPatchMove;
export type JSONPatch = JSONPatchOperation[]