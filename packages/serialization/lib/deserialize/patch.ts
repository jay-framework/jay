import {ADD, JSONPatch, JSONPatchOperation, JSONPointer, MOVE, REMOVE, REPLACE} from "../types";

function applyPatchOperation(target: object, patchOperation: JSONPatchOperation) {
    let {path} = patchOperation
    let dirLength = path.length - 1;
    for (let i = 0; i < dirLength; i++) {
        target = target[path[i]];
        if (!target)
            return;
    }
    if (patchOperation.op === REPLACE || patchOperation.op === ADD)
        target[path[dirLength]] = patchOperation.value
    else if (patchOperation.op === REMOVE) {
        if (Array.isArray(target))
            target.splice(path[dirLength] as number, 1)
        else
            delete target[path[dirLength]];
    }
    else if (patchOperation.op === MOVE && Array.isArray(target)) {
        let [item] = target.splice(patchOperation.from[dirLength] as number, 1)
        target.splice(path[dirLength] as number, 0, item);
    }
}

export function patch(target: object, patch: JSONPatch) {
    patch.forEach(patchOperation => applyPatchOperation(target, patchOperation))
}