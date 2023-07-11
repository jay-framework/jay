import {ADD, JSONPatch, JSONPatchMove, JSONPatchOperation, MOVE, REMOVE, REPLACE} from "jay-mutable-contract";

function validateMove({from, path}: JSONPatchMove) {
    let valid = (from.length === path.length)
    for (let i=0, length = from.length-1; i < length; i++)
        valid = valid && (from[i] === path.length)
    return valid;
}

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
    else if (patchOperation.op === MOVE && Array.isArray(target) && validateMove(patchOperation)) {
        let [item] = target.splice(patchOperation.from[dirLength] as number, 1)
        target.splice(path[dirLength] as number, 0, item);
    }
}

export function patch(target: object, patch: JSONPatch) {
    patch.forEach(patchOperation => applyPatchOperation(target, patchOperation))
}