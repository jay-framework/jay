import {EoF, LinkedListItem, RandomAccessLinkedList} from "./random-access-linked-list";

export const ITEM_ADDED = 'IA';
export const ITEM_REMOVED = 'IR';
export const ITEM_MOVED = 'IM';

const MOVED_FORWARD_NONE = 0;
const MOVED_FORWARD_IN_SEQUENCE = 1;

export interface MatchResult<T> {
    action: typeof ITEM_ADDED | typeof ITEM_MOVED | typeof ITEM_REMOVED,
    item?: T,
    pos: number,
    fromPos?: number
}

export function listCompare<T>(oldArray: RandomAccessLinkedList<T>,
                               newArray: RandomAccessLinkedList<T>,
                               compareItem: (newItem: T, oldItem: T) => void): Array<MatchResult<T>> {
    let oldList = oldArray
    let newList = newArray;

    let oldListItem = oldList.first();
    let newListItem = newList.first();
    let oldIndex = 0;
    let index = 0;
    let instructions = [];
    while (newListItem !== EoF) {
        if (oldListItem === EoF) {
            // process.stdout.write(`add ${newListItem.id} ${index}\n`);
            oldList.add((newListItem as LinkedListItem<T>).value, oldListItem);
            instructions.push({action: ITEM_ADDED, item: (newListItem as LinkedListItem<T>).value, pos: index});
            newListItem = (newListItem as LinkedListItem<T>).next;
            index += 1;
        }
        else if ((oldListItem as LinkedListItem<T>).id !== (newListItem as LinkedListItem<T>).id) {
            if (!newList.has((oldListItem as LinkedListItem<T>).id)) {
                // remove the item
                // process.stdout.write(`remove ${oldListItem.id} ${index}\n`);
                instructions.push({action: ITEM_REMOVED, item: (oldListItem as LinkedListItem<T>).value, pos: index});
                oldList.remove((oldListItem as LinkedListItem<T>));
                oldListItem = (oldListItem as LinkedListItem<T>).next;
            }
            else if (oldList.has((newListItem as LinkedListItem<T>).id)) {
                // console.log('compare item', oldListItem.value, newListItem.value);
                // move the item to this position
                let oldListItemToMove = oldList.get((newListItem as LinkedListItem<T>).id);
                compareItem(newListItem.value, oldListItemToMove.value);
                let distance = oldList.distance(oldListItem, oldListItemToMove);
                // process.stdout.write(`move ${newListItem.id} from ${oldIndex+distance} to ${index}\n`);
                instructions.push({action: ITEM_MOVED, item: oldListItemToMove.value, pos: index, fromPos: oldIndex + distance});
                oldList.move(oldListItemToMove, (oldListItem as LinkedListItem<T>));
                newListItem = (newListItem as LinkedListItem<T>).next;
                index += 1;
                oldIndex += 1;
            }
            else {
                // add
                oldList.add((newListItem as LinkedListItem<T>).value, oldListItem);
                // process.stdout.write(`add2 ${newListItem.id} ${index}\n`);
                instructions.push({action: ITEM_ADDED, item: (newListItem as LinkedListItem<T>).value, pos: index});
                newListItem = (newListItem as LinkedListItem<T>).next;
                index += 1;
                oldIndex += 1;
            }
        }
        else {
            // console.log('compare item', oldListItem.value, newListItem.value);
            compareItem(newListItem.value, oldListItem.value);
            oldListItem = (oldListItem as LinkedListItem<T>).next;
            newListItem = (newListItem as LinkedListItem<T>).next;
            index += 1;
            oldIndex += 1;
        }

    }
    while (oldListItem !== EoF) {
        // process.stdout.write(`remove ${oldListItem.id} ${oldIndex}\n`);
        instructions.push({action: ITEM_REMOVED, item: (oldListItem as LinkedListItem<T>).value, pos: oldIndex});
        oldList.remove((oldListItem as LinkedListItem<T>));
        oldListItem = (oldListItem as LinkedListItem<T>).next;
    }
    return optimize(instructions);
}

function optimize(instructions) {
    // process.stdout.write(JSON.stringify(instructions, undefined, '  ')+`\n`);
    function optimizeSequence(sequenceStart,sequenceEnd) {
        let newMove = {action: ITEM_MOVED, pos: instructions[sequenceEnd].fromPos, fromPos: instructions[sequenceStart].pos};
        instructions.splice(sequenceStart, sequenceEnd-sequenceStart+1, newMove);
    }

    let movedForwardSequenceEnd: number;
    let movedForwardState = MOVED_FORWARD_NONE;
    for (let i=instructions.length-1; i >= 0; i--) {
        // process.stdout.write(`loop ${i} state: ${movedForwardState} s-end: ${movedForwardSequenceEnd}\n`);
        let isCandidateForOptimization = (instructions[i].action === ITEM_MOVED && instructions[i].pos + 1 === instructions[i].fromPos);

        if (movedForwardState === MOVED_FORWARD_IN_SEQUENCE &&
            (!isCandidateForOptimization || instructions[i].pos + 1 !== instructions[i+1].pos)) {
            // completed sequence
            if ((i+1 !== movedForwardSequenceEnd)) {
                // process.stdout.write(`completed sequence from ${i+1} to ${movedForwardSequenceEnd} \n`);
                optimizeSequence(i+1, movedForwardSequenceEnd)
            }
            movedForwardState = MOVED_FORWARD_NONE;
        }

        if (movedForwardState === MOVED_FORWARD_NONE && isCandidateForOptimization) {
            movedForwardState = MOVED_FORWARD_IN_SEQUENCE;
            movedForwardSequenceEnd = i;
        }
    }
    if (movedForwardState === MOVED_FORWARD_IN_SEQUENCE  && movedForwardSequenceEnd > 1) {
        // process.stdout.write(`completed sequence2 from ${0} to ${movedForwardSequenceEnd} \n`);
        optimizeSequence(0, movedForwardSequenceEnd)
    }
    // process.stdout.write(JSON.stringify(instructions, undefined, '  ')+`\n`);
    return instructions;
}
