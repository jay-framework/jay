import {
    ITEM_ADDED,
    ITEM_MOVED,
    ITEM_REMOVED,
    listCompare,
    RandomAccessLinkedList as List,
} from '@jay-framework/list-compare';
import { ADD, JSONPatch, JSONPointer, MOVE, REMOVE, REPLACE } from '../json-patch-contract';

type MeasureOfChange = number;
type DataFields = number;
type ArrayContext = {
    matchBy: string;
};
export type ArrayContexts = [JSONPointer, ArrayContext][];

const LIST_COMPARE_RESULT_TO_JSON_PATCH = {};
LIST_COMPARE_RESULT_TO_JSON_PATCH[ITEM_ADDED] = (instruction, path) => ({
    op: ADD,
    value: instruction.item,
    path: [...path, instruction.pos],
});
LIST_COMPARE_RESULT_TO_JSON_PATCH[ITEM_MOVED] = (instruction, path) => ({
    op: MOVE,
    from: [...path, instruction.fromPos],
    path: [...path, instruction.pos],
});
LIST_COMPARE_RESULT_TO_JSON_PATCH[ITEM_REMOVED] = (instruction, path) => ({
    op: REMOVE,
    path: [...path, instruction.pos],
});

function findArrayContext(contexts: ArrayContexts, path: JSONPointer): ArrayContext {
    let foundContext = contexts?.find(([pointer]) => {
        return (
            path.length === pointer.length &&
            path.reduce((prev, curr, index) => {
                return prev && curr === '*' ? true : curr === path[index];
            }, true)
        );
    });
    return foundContext ? foundContext[1] : undefined;
}

function diffObjectOrArray(
    newValue: object,
    oldValue: object,
    contexts: ArrayContexts,
    path: JSONPointer,
) {
    let diffResults: [JSONPatch, MeasureOfChange, DataFields][] = [];
    let keys, i, length;
    keys = Object.keys(newValue);
    let oldKeys = Object.keys(oldValue);
    length = keys.length;
    for (i = length; i-- !== 0; ) {
        const key = keys[i];
        diffResults.push(
            diff(
                (newValue as Record<string, unknown>)[key],
                (oldValue as Record<string, unknown>)[key],
                contexts,
                [...path, key],
            ),
        );
    }
    for (i = oldKeys.length; i-- !== 0; ) {
        const key = oldKeys[i];
        if (!(key in newValue)) diffResults.push([[{ op: REMOVE, path: [...path, key] }], 1, 1]);
    }
    return flattenPatch(diffResults, path, newValue);
}

function flattenPatch(
    diffResults: [JSONPatch, MeasureOfChange, DataFields][],
    path: JSONPointer,
    newValue: unknown,
): [JSONPatch, MeasureOfChange, DataFields] {
    let [measureOfChange, dataFields] = diffResults.reduce(
        (prev, curr) => [prev[0] + curr[1], prev[1] + curr[2]],
        [0, 0],
    );

    if (measureOfChange / dataFields > 0.5) return [[{ op: REPLACE, path, value: newValue }], 1, 1];
    else return [diffResults.map((_) => _[0]).flat(), measureOfChange, dataFields];
}

function diffArrayWithContext(
    context: ArrayContext,
    oldValue: any[],
    newValue: any[],
    path: JSONPointer,
    contexts: [JSONPointer, ArrayContext][],
) {
    let { matchBy } = context;
    const lastArray = new List<any, any>(oldValue, matchBy);
    const newArray = new List<any, any>(newValue, matchBy);
    const instructions = listCompare<any, any>(lastArray, newArray, () => {});
    const arrayPatch: JSONPatch = instructions.map((instruction) =>
        LIST_COMPARE_RESULT_TO_JSON_PATCH[instruction.action](instruction, path),
    ) as JSONPatch;
    const arrayItemPatches: [JSONPatch, MeasureOfChange, DataFields][] = [
        [arrayPatch, instructions.length, newValue.length],
    ];
    newArray.forEach((newArrayItem, _, index) => {
        let oldArrayItem = lastArray.get(newArrayItem[matchBy]);
        if (oldArrayItem)
            arrayItemPatches.push(
                diff(newArrayItem, oldArrayItem.value, contexts, [...path, '' + index]),
            );
    });
    return flattenPatch(arrayItemPatches, path, newValue);
}

export function diff<T>(
    newValue: T,
    oldValue: T,
    contexts?: ArrayContexts,
    path: JSONPointer = [],
): [JSONPatch, MeasureOfChange, DataFields] {
    if (oldValue === undefined || oldValue === null)
        return [[{ op: ADD, path, value: newValue }], 1, 1];
    // Primitives
    if (newValue === oldValue) return [[], 0, 1];

    if (newValue && oldValue && typeof newValue === 'object' && typeof oldValue === 'object') {
        if (Array.isArray(newValue) && Array.isArray(oldValue)) {
            let context = findArrayContext(contexts, path);
            if (context) {
                return diffArrayWithContext(context, oldValue, newValue, path, contexts);
            }
        }
        if (Array.isArray(newValue) !== Array.isArray(oldValue))
            return [[{ op: REPLACE, path, value: newValue }], 1, 1];

        return diffObjectOrArray(
            newValue as any as object,
            oldValue as any as object,
            contexts,
            path,
        );
    }

    return [[{ op: REPLACE, path, value: newValue }], 1, 1];
}
