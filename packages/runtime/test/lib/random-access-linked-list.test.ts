import {
  BoF,
  EoF,
  LinkedListItem,
  RandomAccessLinkedList,
} from '../../lib/random-access-linked-list';
import { describe, expect, it } from '@jest/globals';

interface Item {
  id: string;
  val: number;
}
const item = (id, val) => {
  return { id, val };
};

const itemA: Item = item('a', 123);
const itemB: Item = item('b', 456);
const itemC: Item = item('c', 789);
const itemD: Item = item('d', 1234);
const itemE: Item = item('e', 2345);
const itemX: Item = item('x', 2345);

const attach1 = 'A';
const attach2 = 'B';
const attach3 = 'C';

const listToArray = (list) => {
  let first = list.first();
  let res = [];
  while (first != EoF) {
    res.push(first.value);
    first = first.next;
  }
  return res;
};

describe('random-access-linked-list', () => {
  it('create a list from array', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');

    expect(list.first().value).toBe(itemA);
    expect(list.first().next.value).toBe(itemB);
    expect(list.first().next.next.value).toBe(itemC);
    expect(list.first().next.next.next.value).toBe(itemD);
    expect(list.first().next.next.next.next.value).toBe(itemE);
    expect(list.first().next.next.next.next.next).toBe(EoF);
  });

  it('create a 2 way list from array', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');

    expect(list.first().prev).toBe(BoF);
    expect(list.first().next.prev.value).toBe(itemA);
    expect(list.first().next.next.prev.value).toBe(itemB);
    expect(list.first().next.next.next.prev.value).toBe(itemC);
    expect(list.first().next.next.next.next.prev.value).toBe(itemD);
  });

  it('allows direct access to last', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');

    expect(list.last().value).toBe(itemE);
    expect(list.last().prev.value).toBe(itemD);
  });

  it('allows random access to middle of the list by id', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');

    expect(list.get(itemC.id).value).toBe(itemC);
    expect(list.get(itemC.id).next.value).toBe(itemD);
    expect(list.get(itemC.id).next.next.value).toBe(itemE);
    expect(list.get(itemC.id).next.next.next).toBe(EoF);
  });

  it('supports has', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');

    expect(list.has(itemC.id)).toBe(true);
    expect(list.has(itemX.id)).toBe(false);
  });

  it('supports has', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');

    expect(list.distance(list.get(itemA.id), list.get(itemC.id))).toBe(2);
    expect(list.distance(list.get(itemC.id), list.get(itemE.id))).toBe(2);
    expect(list.distance(list.get(itemB.id), list.get(itemE.id))).toBe(3);
    expect(list.distance(list.get(itemC.id), list.get(itemA.id))).toBe(-1);
    expect(list.distance(list.get(itemC.id), list.get(itemX.id))).toBe(-1);
  });

  it('support add', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.add(itemD, list.get(itemB.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemD, itemB, itemC]);
    expect(list.has(itemD.id)).toBeTruthy;
    expect(list.get(itemD.id).next.value).toBe(itemB);
    expect(list.get(itemD.id).prev.value).toBe(itemA);
    expect(list.get(itemA.id).next.value).toBe(itemD);
    expect(list.get(itemB.id).prev.value).toBe(itemD);
  });

  it('support add first', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.add(itemD, list.get(itemA.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemD, itemA, itemB, itemC]);
    expect(list.has(itemD.id)).toBeTruthy;
    expect(list.get(itemD.id).next.value).toBe(itemA);
    expect(list.get(itemD.id).prev).toBe(BoF);
    expect(list.get(itemA.id).prev.value).toBe(itemD);
    expect(list.first().value).toBe(itemD);
  });

  it('support add last', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.add(itemD, EoF);

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemB, itemC, itemD]);
    expect(list.has(itemD.id)).toBeTruthy;
    expect(list.get(itemD.id).next).toBe(EoF);
    expect(list.get(itemD.id).prev.value).toBe(itemC);
    expect(list.get(itemC.id).next.value).toBe(itemD);
    expect(list.last().value).toBe(itemD);
  });

  it('support add on empty list', () => {
    const arr = [];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.add(itemD, EoF);
    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemD]);
    expect(list.has(itemD.id)).toBeTruthy;
    expect(list.get(itemD.id).next).toBe(EoF);
    expect(list.get(itemD.id).prev).toBe(BoF);
  });

  it('support remove', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.remove(list.get(itemB.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemC]);
    expect(list.get(itemA.id).next.value).toBe(itemC);
    expect(list.get(itemC.id).prev.value).toBe(itemA);
    expect(list.has(itemB.id)).toBeFalsy;
  });

  it('support remove first', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.remove(list.get(itemA.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemB, itemC]);
    expect(list.get(itemB.id).prev).toBe(BoF);
    expect(list.first().value).toBe(itemB);
    expect(list.has(itemA.id)).toBeFalsy;
  });

  it('support remove last', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.remove(list.get(itemC.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemB]);
    expect(list.get(itemB.id).next).toBe(EoF);
    expect(list.last().value).toBe(itemB);
    expect(list.has(itemC.id)).toBeFalsy;
  });

  it('support remove all', () => {
    const arr = [itemA, itemB, itemC];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.remove(list.get(itemB.id));
    list.remove(list.get(itemA.id));
    list.remove(list.get(itemC.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([]);
    expect(list.first()).toBe(EoF);
    expect(list.last()).toBe(BoF);
    expect(list.has(itemA.id)).toBeFalsy;
    expect(list.has(itemB.id)).toBeFalsy;
    expect(list.has(itemC.id)).toBeFalsy;
  });

  it('support move forward', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.move(list.get(itemB.id), list.get(itemE.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemC, itemD, itemB, itemE]);

    expect(list.get(itemA.id).next.value).toBe(itemC);
    expect(list.get(itemC.id).prev.value).toBe(itemA);
    expect(list.get(itemD.id).next.value).toBe(itemB);
    expect(list.get(itemB.id).next.value).toBe(itemE);
    expect(list.get(itemB.id).prev.value).toBe(itemD);
    expect(list.get(itemE.id).prev.value).toBe(itemB);
  });

  it('support move to last', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.move(list.get(itemB.id), EoF);

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemC, itemD, itemE, itemB]);

    expect(list.get(itemA.id).next.value).toBe(itemC);
    expect(list.get(itemC.id).prev.value).toBe(itemA);
    expect(list.get(itemE.id).next.value).toBe(itemB);
    expect(list.get(itemB.id).next).toBe(EoF);
    expect(list.get(itemB.id).prev.value).toBe(itemE);
    expect(list.last().value).toBe(itemB);
  });

  it('support move backwards', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.move(list.get(itemD.id), list.get(itemB.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemA, itemD, itemB, itemC, itemE]);

    expect(list.get(itemA.id).next.value).toBe(itemD);
    expect(list.get(itemD.id).next.value).toBe(itemB);
    expect(list.get(itemD.id).prev.value).toBe(itemA);
    expect(list.get(itemB.id).prev.value).toBe(itemD);
    expect(list.get(itemC.id).next.value).toBe(itemE);
    expect(list.get(itemE.id).prev.value).toBe(itemC);
  });

  it('support move to first', () => {
    const arr = [itemA, itemB, itemC, itemD, itemE];

    const list = new RandomAccessLinkedList(arr, 'id');
    list.move(list.get(itemD.id), list.get(itemA.id));

    let listAsArray = listToArray(list);
    expect(listAsArray).toEqual([itemD, itemA, itemB, itemC, itemE]);

    expect(list.get(itemD.id).prev).toBe(BoF);
    expect(list.get(itemD.id).next.value).toBe(itemA);
    expect(list.get(itemA.id).prev.value).toBe(itemD);
    expect(list.get(itemC.id).next.value).toBe(itemE);
    expect(list.get(itemE.id).prev.value).toBe(itemC);
    expect(list.first().value).toBe(itemD);
  });

  it('stores attachements', () => {
    const list = new RandomAccessLinkedList([], 'id');
    list.add(itemA, EoF, attach1);
    list.add(itemB, EoF, attach2);
    list.add(itemC, EoF, attach3);

    expect(list.first().attach).toBe(attach1);
    expect(list.first().next.attach).toBe(attach2);
    expect(list.first().next.next.attach).toBe(attach3);
  });
  it('moves itesm with attachements', () => {
    const list = new RandomAccessLinkedList<Item, string>([], 'id');
    list.add(itemA, EoF, attach1);
    list.add(itemB, EoF, attach2);
    list.add(itemC, EoF, attach3);

    list.move(
      (list.first() as LinkedListItem<Item, string>).next as LinkedListItem<Item, string>,
      list.first() as LinkedListItem<Item, string>
    );

    expect(list.first().attach).toBe(attach2);
    expect(list.first().next.attach).toBe(attach1);
    expect(list.first().next.next.attach).toBe(attach3);
  });
});
