export const ITEM_ADDED = 'IA';
export const ITEM_REMOVED = 'IR';
export const ITEM_MOVED = 'IM';

const MOVED_FORWARD_NONE = 0;
const MOVED_FORWARD_IN_SEQUENCE = 1;

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

    // {action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2},
    // {action: ITEM_MOVED, item: itemD, pos: 2, fromPos: 3},
    // {action: ITEM_MOVED, item: itemE, pos: 3, fromPos: 4}
    console.log(result);
    // optimize moves
    let movedForwardSequenceEnd: number;
    let movedForwardState = MOVED_FORWARD_NONE;
    for (let i=result.length-1; i >= 0; i--) {
        if (movedForwardState === MOVED_FORWARD_NONE && result[i].action === ITEM_MOVED && result[i].pos + 1 === result[i].fromPos) {
            movedForwardState = MOVED_FORWARD_IN_SEQUENCE;
            movedForwardSequenceEnd = i;
        }
        else if (movedForwardState === MOVED_FORWARD_IN_SEQUENCE && !(result[i].action === ITEM_MOVED && result[i].pos + 1 === result[i].fromPos)) {
            // completed sequence
            console.log('y', i, movedForwardSequenceEnd);
            if ((i+1 !== movedForwardSequenceEnd)) {
                let newMove = {action: ITEM_MOVED, item: oldList[result[i].pos], pos: result[movedForwardSequenceEnd].fromPos, fromPos: result[i].pos};
                result.splice(i, movedForwardSequenceEnd+1, newMove)
            }
            movedForwardState = MOVED_FORWARD_NONE;
        }
    }
    if (movedForwardState === MOVED_FORWARD_IN_SEQUENCE && (0 !== movedForwardSequenceEnd)) {
        // completed sequence
        console.log('x', 0, movedForwardSequenceEnd);
        let newMove = {action: ITEM_MOVED, item: oldList[result[0].pos], pos: result[movedForwardSequenceEnd].fromPos, fromPos: result[0].pos};
        result.splice(0, movedForwardSequenceEnd+1, newMove)
    }
    return result;
}