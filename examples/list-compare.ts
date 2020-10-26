interface MatchResult {}

export const ITEM_ADDED = 'IA';
export const ITEM_REMOVED = 'IR';
export const ITEM_MOVED = 'IM';

export function listCompare(oldList: Array<_>, newList: Array<_>, matchBy: string): Array<MatchResult> {
    let oldKeys = new Set(oldList.map(_ => _[matchBy]));
    let newKeys = new Set(newList.map(_ => _[matchBy]));
    let moved = new Set();

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
                result.push({action: ITEM_MOVED, item: newList[newIndex], pos: newIndex});
                moved.add(newList[newIndex][matchBy]);
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
    console.log('----', oldIndex, newIndex);
    while(oldIndex < oldList.length) {
        if (!moved.has(oldList[oldIndex][matchBy])) {
            result.push({action: ITEM_REMOVED, item: oldList[oldIndex], pos: oldIndex});
        }
        oldIndex++;
    }
    while(newIndex < newList.length) {
        result.push({action: ITEM_ADDED, item: newList[newIndex], pos: newIndex});
        newIndex++;
    }

    return result;
}