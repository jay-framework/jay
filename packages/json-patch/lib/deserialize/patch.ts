import { ADD, JSONPatch, JSONPatchMove, MOVE, REMOVE, REPLACE } from '../json-patch-contract';

function validateMove({ from, path }: JSONPatchMove) {
    let valid = from.length === path.length;
    for (let i = 0, length = from.length - 1; i < length; i++) valid = valid && from[i] === path[i];
    return valid;
}

export function patch<T>(target: T, jsonPatch: JSONPatch, level = 0): T {
    let copy: T = (Array.isArray(target) ? [...target] : { ...target }) as T;
    let patchesGroupedByProp = jsonPatch.reduce((prev, patchOperation) => {
        const pathItem = patchOperation.path[level];
        const op = patchOperation.op;
        if (patchOperation.path.length - 1 === level) {
            if (op === REPLACE || op === ADD) {
                if (Array.isArray(copy) && op === ADD)
                    copy.splice(pathItem as number, 0, patchOperation.value);
                else copy[pathItem] = patchOperation.value;
            } else if (op === REMOVE) {
                if (Array.isArray(copy)) copy.splice(pathItem as number, 1);
                else delete copy[pathItem];
            } else if (op === MOVE && Array.isArray(copy) && validateMove(patchOperation)) {
                let [item] = copy.splice(patchOperation.from[level] as number, 1);
                copy.splice(pathItem as number, 0, item);
            }
        } else if (!prev[pathItem]) prev[pathItem] = [patchOperation];
        else prev[pathItem].push(patchOperation);
        return prev;
    }, {});

    Object.keys(patchesGroupedByProp).forEach((key) => {
        if (copy[key]) copy[key] = patch(copy[key], patchesGroupedByProp[key], level + 1);
    });
    return copy;
}
