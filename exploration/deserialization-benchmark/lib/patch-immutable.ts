import {
    ADD,
    JSONPatch,
    JSONPatchMove,
    JSONPatchOperation,
    MOVE,
    REMOVE,
    REPLACE,
} from 'jay-json-patch';

function validateMove({ from, path }: JSONPatchMove) {
    let valid = from.length === path.length;
    for (let i = 0, length = from.length - 1; i < length; i++) valid = valid && from[i] === path[i];
    return valid;
}

function applyPatchOperation(target: object, patchOperation: JSONPatchOperation) {
    let { path } = patchOperation;
    let dirLength = path.length - 1;
    for (let i = 0; i < dirLength; i++) {
        target = target[path[i]];
        if (!target) return;
    }
    if (patchOperation.op === REPLACE || patchOperation.op === ADD)
        target[path[dirLength]] = patchOperation.value;
    else if (patchOperation.op === REMOVE) {
        if (Array.isArray(target)) target.splice(path[dirLength] as number, 1);
        else delete target[path[dirLength]];
    } else if (
        patchOperation.op === MOVE &&
        Array.isArray(target) &&
        validateMove(patchOperation)
    ) {
        let [item] = target.splice(patchOperation.from[dirLength] as number, 1);
        target.splice(path[dirLength] as number, 0, item);
    }
}

export function patchImmutable(target: object, patch: JSONPatch, level = 0) {
    let copy = Array.isArray(target) ? [...target] : { ...target };
    let patchesGroupedByProp = patch.reduce((prev, patchOperation) => {
        if (patchOperation.path.length - 1 === level) {
            if (patchOperation.op === REPLACE || patchOperation.op === ADD)
                copy[patchOperation.path[level]] = patchOperation.value;
            else if (patchOperation.op === REMOVE) {
                if (Array.isArray(copy)) copy.splice(patchOperation.path[level] as number, 1);
                else delete copy[patchOperation.path[level]];
            } else if (
                patchOperation.op === MOVE &&
                Array.isArray(copy) &&
                validateMove(patchOperation)
            ) {
                let [item] = copy.splice(patchOperation.from[level] as number, 1);
                copy.splice(patchOperation.path[level] as number, 0, item);
            }
        } else if (!prev[patchOperation.path[level]])
            prev[patchOperation.path[level]] = [patchOperation];
        else prev[patchOperation.path[level]].push(patchOperation);
        return prev;
    }, {});

    Object.keys(patchesGroupedByProp).forEach((key) => {
        copy[key] = patchImmutable(copy[key], patchesGroupedByProp[key], level + 1);
    });
    return copy;
}
