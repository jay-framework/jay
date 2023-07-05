import {ADD, JSONPatch, JSONPatchOperation, JSONPointer, REMOVE, REPLACE} from "../types";

function applyPatchOperation(target: object, patchOperation: JSONPatchOperation) {
    let {path, op} = patchOperation
    let dirLength = path.length - 1;
    for (let i = 0; i < dirLength; i++) {
        target = target[path[i]];
    }
    if (patchOperation.op === REPLACE || patchOperation.op === ADD)
        target[path[dirLength]] = patchOperation.value
    else if (op === REMOVE)
        delete target[path[dirLength]];
}

export function applyPatch(target: object, patch: JSONPatch) {
    patch.forEach(patchOperation => applyPatchOperation(target, patchOperation))
}