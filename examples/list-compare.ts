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
    let numRemoved = 0;

    let oldIndex = 0;
    let newIndex = 0;

    const stepOldIndex = () => {
        oldIndex++;
        while (oldIndex < oldList.length && !!moved[oldList[oldIndex][matchBy]]) {
           // console.log('stepOldIndex', oldIndex)
            moved[oldList[oldIndex][matchBy]].fromPos = oldIndex - numRemoved;
            oldIndex++;
        }
    };

    let result = [];
    while(newIndex < newList.length && oldIndex < oldList.length) {
        if (oldList[oldIndex][matchBy] === newList[newIndex][matchBy]) {
           // console.log('same', oldIndex, newIndex)
            newIndex++;
            stepOldIndex();
        }
        else {
            let newHasOldItem = newKeys.has(oldList[oldIndex][matchBy]);
            let oldHasNewItem = oldKeys.has(newList[newIndex][matchBy]);
            if (newHasOldItem && oldHasNewItem) {
               // console.log('move', oldIndex, newIndex)
                let movedItemInstruction = {action: ITEM_MOVED, item: newList[newIndex], pos: newIndex};
                result.push(movedItemInstruction);
                moved[newList[newIndex][matchBy]] = movedItemInstruction;
                newIndex++;
            }
            else if (newHasOldItem) {
               // console.log('new', oldIndex, newIndex)
                // new item
                result.push({action: ITEM_ADDED, item: newList[newIndex], pos: newIndex});
                newIndex++;
            }
            else {
               // console.log('remove', oldIndex, newIndex)
                // new removed
                result.push({action: ITEM_REMOVED, item: oldList[oldIndex], pos: oldIndex});
                stepOldIndex();
                numRemoved++;
            }
        }
    }
   // console.log('----', oldIndex, newIndex)
    while(oldIndex < oldList.length) {
        if (!moved[oldList[oldIndex][matchBy]]) {
            numRemoved++;
            result.push({action: ITEM_REMOVED, item: oldList[oldIndex], pos: oldIndex});
        }
        else {
            moved[oldList[oldIndex][matchBy]].fromPos = oldIndex - numRemoved;
        }
        oldIndex++;
    }
    while(newIndex < newList.length) {
        result.push({action: ITEM_ADDED, item: newList[newIndex], pos: newIndex});
        newIndex++;
    }

    console.log('listCompare', oldList, newList, result)
    return result;
}