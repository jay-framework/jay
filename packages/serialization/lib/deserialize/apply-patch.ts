import {ADD, JSONPatch, JSONPatchOperation, JSONPointer, REMOVE, REPLACE} from "../types";

function applyPatchOperation(target: object, patchOperation: JSONPatchOperation) {
    let dirLength = patchOperation.path.length - 1;
    for (let i = 0; i < dirLength; i++) {
        target = target[i];
    }
    if (patchOperation.op === REPLACE || patchOperation.op === ADD)
        target[patchOperation.path[dirLength]] = patchOperation.value
    else if (patchOperation.op === REMOVE)
        delete target[patchOperation.path[dirLength]];
}

export function applyPatch(target: object, patch: JSONPatch) {
    patch.forEach(patchOperation => applyPatchOperation(target, patchOperation))
}