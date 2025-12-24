import { ADD, JSONPatch, JSONPatchMove, MOVE, REMOVE, REPLACE } from '../json-patch-contract';

function validateMove({ from, path }: JSONPatchMove): boolean {
    let valid = from.length === path.length;
    for (let i = 0, length = from.length - 1; i < length; i++) valid = valid && from[i] === path[i];
    return valid;
}

export function patch<T>(target: T, jsonPatch: JSONPatch<T>, level = 0): T {
    // Use any for internal mutation since we're doing dynamic property access
    const copy: any = Array.isArray(target) ? [...target] : { ...target };
    let equalCount = 0;
    const patchesGroupedByProp: Record<string | number, JSONPatch> = {};

    for (const patchOperation of jsonPatch) {
        const path = patchOperation.path as (string | number)[];
        const pathItem = path[level];
        const op = patchOperation.op;

        if (path.length - 1 === level) {
            if (op === REPLACE || op === ADD) {
                if (Array.isArray(copy) && op === ADD) {
                    copy.splice(pathItem as number, 0, (patchOperation as { value: unknown }).value);
                } else if (copy[pathItem] === (patchOperation as { value: unknown }).value) {
                    equalCount += 1;
                } else {
                    copy[pathItem] = (patchOperation as { value: unknown }).value;
                }
            } else if (op === REMOVE) {
                if (Array.isArray(copy)) copy.splice(pathItem as number, 1);
                else delete copy[pathItem];
            } else if (op === MOVE && Array.isArray(copy) && validateMove(patchOperation as JSONPatchMove)) {
                const fromPath = (patchOperation as JSONPatchMove).from;
                const [item] = copy.splice(fromPath[level] as number, 1);
                copy.splice(pathItem as number, 0, item);
            }
        } else if (!patchesGroupedByProp[pathItem]) {
            patchesGroupedByProp[pathItem] = [patchOperation as JSONPatch[number]];
        } else {
            patchesGroupedByProp[pathItem].push(patchOperation as JSONPatch[number]);
        }
    }

    for (const key of Object.keys(patchesGroupedByProp)) {
        if (copy[key]) {
            const targetVal = (target as any)[key];
            const patched = patch(copy[key], patchesGroupedByProp[key], level + 1);
            if (targetVal === patched) {
                equalCount += patchesGroupedByProp[key].length;
            } else {
                copy[key] = patched;
            }
        }
    }

    if (equalCount === jsonPatch.length) return target;
    else return copy as T;
}
