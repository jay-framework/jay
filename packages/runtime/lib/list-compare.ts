import { EoF, LinkedListItem, RandomAccessLinkedList } from './random-access-linked-list';
import { JayElement } from './element';

export const ITEM_ADDED = 'IA';
export const ITEM_REMOVED = 'IR';
export const ITEM_MOVED = 'IM';

const MOVED_FORWARD_NONE = 0;
const MOVED_FORWARD_IN_SEQUENCE = 1;

export interface MatchResult<T> {
  action: typeof ITEM_ADDED | typeof ITEM_MOVED | typeof ITEM_REMOVED;
  item?: T;
  pos: number;
  fromPos?: number;
  elem?: JayElement<T>;
}

export function listCompare<T>(
  oldArray: RandomAccessLinkedList<T, JayElement<T>>,
  newArray: RandomAccessLinkedList<T, JayElement<T>>,
  mkElement: (T) => JayElement<T>
): Array<MatchResult<T>> {
  let oldList = oldArray;
  let newList = newArray;

  let oldListItem = oldList.first();
  let newListItem_ = newList.first();
  let oldIndex = 0;
  let index = 0;
  let instructions = [];
  while (newListItem_ !== EoF) {
    let newListItem = newListItem_ as LinkedListItem<T, JayElement<T>>;
    if (oldListItem === EoF) {
      // process.stdout.write(`add ${newListItem.id} ${index}\n`);
      let newElement = mkElement(newListItem.value);
      oldList.add(newListItem.value, oldListItem, newElement);
      newListItem.attach = newElement;
      instructions.push({
        action: ITEM_ADDED,
        item: newListItem.value,
        pos: index,
        elem: newElement,
      });
      newListItem_ = newListItem.next;
      index += 1;
    } else if (oldListItem.id !== newListItem.id) {
      if (!newList.has(oldListItem.id)) {
        // remove the item
        // process.stdout.write(`remove ${oldListItem.id} ${index}\n`);
        instructions.push({ action: ITEM_REMOVED, item: oldListItem.value, pos: index });
        oldList.remove(oldListItem);
        oldListItem = oldListItem.next;
      } else if (oldList.has(newListItem.id)) {
        // console.log('compare item', oldListItem.value, newListItem.value);
        // move the item to this position
        let oldListItemToMove = oldList.get(newListItem.id);
        newListItem.attach = oldListItemToMove.attach;
        let distance = oldList.distance(oldListItem, oldListItemToMove);
        // process.stdout.write(`move ${newListItem.id} from ${oldIndex+distance} to ${index}\n`);
        instructions.push({
          action: ITEM_MOVED,
          item: oldListItemToMove.value,
          pos: index,
          fromPos: oldIndex + distance,
        });
        oldList.move(oldListItemToMove, oldListItem);
        newListItem_ = newListItem.next;
        index += 1;
        oldIndex += 1;
      } else {
        // add
        let newElement = mkElement(newListItem.value);
        oldList.add(newListItem.value, oldListItem, newElement);
        newListItem.attach = newElement;
        // process.stdout.write(`add2 ${newListItem.id} ${index}\n`);
        instructions.push({
          action: ITEM_ADDED,
          item: newListItem.value,
          pos: index,
          elem: newElement,
        });
        newListItem_ = newListItem.next;
        index += 1;
        oldIndex += 1;
      }
    } else {
      // console.log('compare item', oldListItem.value, newListItem.value);
      newListItem.attach = oldListItem.attach;
      oldListItem = oldListItem.next;
      newListItem_ = newListItem.next;
      index += 1;
      oldIndex += 1;
    }
  }
  while (oldListItem !== EoF) {
    // process.stdout.write(`remove ${oldListItem.id} ${oldIndex}\n`);
    instructions.push({ action: ITEM_REMOVED, item: oldListItem.value, pos: oldIndex });
    oldList.remove(oldListItem);
    oldListItem = oldListItem.next;
  }
  return optimize(instructions);
}

function optimize(instructions) {
  // process.stdout.write(JSON.stringify(instructions, undefined, '  ')+`\n`);
  function optimizeSequence(sequenceStart, sequenceEnd) {
    let newMove = {
      action: ITEM_MOVED,
      pos: instructions[sequenceEnd].fromPos,
      fromPos: instructions[sequenceStart].pos,
    };
    instructions.splice(sequenceStart, sequenceEnd - sequenceStart + 1, newMove);
  }

  let movedForwardSequenceEnd: number;
  let movedForwardState = MOVED_FORWARD_NONE;
  for (let i = instructions.length - 1; i >= 0; i--) {
    // process.stdout.write(`loop ${i} state: ${movedForwardState} s-end: ${movedForwardSequenceEnd}\n`);
    let isCandidateForOptimization =
      instructions[i].action === ITEM_MOVED && instructions[i].pos + 1 === instructions[i].fromPos;

    if (
      movedForwardState === MOVED_FORWARD_IN_SEQUENCE &&
      (!isCandidateForOptimization || instructions[i].pos + 1 !== instructions[i + 1].pos)
    ) {
      // completed sequence
      if (i + 1 !== movedForwardSequenceEnd) {
        // process.stdout.write(`completed sequence from ${i+1} to ${movedForwardSequenceEnd} \n`);
        optimizeSequence(i + 1, movedForwardSequenceEnd);
      }
      movedForwardState = MOVED_FORWARD_NONE;
    }

    if (movedForwardState === MOVED_FORWARD_NONE && isCandidateForOptimization) {
      movedForwardState = MOVED_FORWARD_IN_SEQUENCE;
      movedForwardSequenceEnd = i;
    }
  }
  if (movedForwardState === MOVED_FORWARD_IN_SEQUENCE && movedForwardSequenceEnd > 1) {
    // process.stdout.write(`completed sequence2 from ${0} to ${movedForwardSequenceEnd} \n`);
    optimizeSequence(0, movedForwardSequenceEnd);
  }
  // process.stdout.write(JSON.stringify(instructions, undefined, '  ')+`\n`);
  return instructions;
}
