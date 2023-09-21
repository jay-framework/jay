export const ADD = 'add';
export const REPLACE = 'replace';
export const REMOVE = 'remove';
export const MOVE = 'move';
export type JSONPointer = (string | number)[];

export interface JSONPatchAdd {
    op: typeof ADD;
    path: JSONPointer;
    value: any;
}

export interface JSONPatchReplace {
    op: typeof REPLACE;
    path: JSONPointer;
    value: any;
}

export interface JSONPatchRemove {
    op: typeof REMOVE;
    path: JSONPointer;
}

export interface JSONPatchMove {
    op: typeof MOVE;
    from: JSONPointer;
    path: JSONPointer;
}

export type JSONPatchOperation = JSONPatchAdd | JSONPatchReplace | JSONPatchRemove | JSONPatchMove;
export type JSONPatch = JSONPatchOperation[];
