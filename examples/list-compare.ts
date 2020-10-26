export const ITEM_ADDED = 'IA';
export const ITEM_REMOVED = 'IR';
export const ITEM_MOVED = 'IM';

interface MatchResult<T> {
    action: typeof ITEM_ADDED | typeof ITEM_MOVED | typeof ITEM_REMOVED,
    item: T,
    pos: number,
    fromPos?: number
}

export function listCompare<T>(oldList: Array<T>, newList: Array<T>, matchBy: string): Array<MatchResult<T>> {
    let oldKeys = new Set(oldList.map(_ => _[matchBy]));
    let newKeys = new Set(newList.map(_ => _[matchBy]));
    let moved = {};

    let oldIndex = 0;
    let newIndex = 0;

    let result = [];
    while(newIndex < newList.length && oldIndex < oldList.length) {
        if (oldList[oldIndex][matchBy] === newList[newIndex][matchBy]) {
            newIndex++;
            oldIndex++;
        }
        else {
            let newHasOldItem = newKeys.has(oldList[oldIndex][matchBy]);
            let oldHasNewItem = oldKeys.has(newList[newIndex][matchBy]);
            if (newHasOldItem && oldHasNewItem) {
                let movedItemInstruction = {action: ITEM_MOVED, item: newList[newIndex], pos: newIndex};
                result.push(movedItemInstruction);
                moved[newList[newIndex][matchBy]] = movedItemInstruction;
                newIndex++;
            }
            else if (newHasOldItem) {
                // new item
                result.push({action: ITEM_ADDED, item: newList[newIndex], pos: newIndex});
                newIndex++;
            }
            else {
                // new removed
                result.push({action: ITEM_REMOVED, item: oldList[oldIndex], pos: oldIndex});
                oldIndex++;
            }
        }
    }
    while(oldIndex < oldList.length) {
        if (!moved[oldList[oldIndex][matchBy]]) {
            result.push({action: ITEM_REMOVED, item: oldList[oldIndex], pos: oldIndex});
        }
        else {
            moved[oldList[oldIndex][matchBy]].fromPos = oldIndex;
        }
        oldIndex++;
    }
    while(newIndex < newList.length) {
        result.push({action: ITEM_ADDED, item: newList[newIndex], pos: newIndex});
        newIndex++;
    }

    return result;
}