import {BoF, EoF, RandomAccessLinkedList} from '../../examples/random-access-linked-list';

const item = (id, val) => {return {id, val}};

const itemA = item('a', 123);
const itemB = item('b', 456);
const itemC = item('c', 789);
const itemD = item('d', 1234);
const itemE = item('e', 2345);
const itemX = item('x', 2345);

const listToArray = (list) => {
    let first = list.first();
    let res = [];
    while (first != EoF) {
        res.push(first.value);
        first = first.next;
    }
    return res;
}

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
        expect(list.get(itemD.id).next.value).toBe(itemA);
        expect(list.get(itemD.id).prev).toBe(BoF);
        expect(list.get(itemA.id).prev.value).toBe(itemD);
    });

    it('support add last', () => {
        const arr = [itemA, itemB, itemC];

        const list = new RandomAccessLinkedList(arr, 'id');
        list.add(itemD, EoF);

        let listAsArray = listToArray(list);
        expect(listAsArray).toEqual([itemA, itemB, itemC, itemD]);
        expect(list.get(itemD.id).next).toBe(EoF);
        expect(list.get(itemD.id).prev.value).toBe(itemC);
        expect(list.get(itemC.id).next.value).toBe(itemD);
    });

    it('support add on empty list', () => {
        const arr = [];

        const list = new RandomAccessLinkedList(arr, 'id');
        list.add(itemD, EoF);
        let listAsArray = listToArray(list);
        expect(listAsArray).toEqual([itemD]);
        expect(list.get(itemD.id).next).toBe(EoF);
        expect(list.get(itemD.id).prev).toBe(BoF);
    });

    it('support remove', () => {
        const arr = [itemA, itemB, itemC];

        const list = new RandomAccessLinkedList(arr, 'id');
        list.remove(list.get(itemB.id));

        let listAsArray = listToArray(list);
        expect(listAsArray).toEqual([itemA, itemC]);
    });

    it('support remove all', () => {
        const arr = [itemA, itemB, itemC];

        const list = new RandomAccessLinkedList(arr, 'id');
        list.remove(list.get(itemB.id));
        list.remove(list.get(itemA.id));
        list.remove(list.get(itemC.id));

        let listAsArray = listToArray(list);
        expect(listAsArray).toEqual([]);
    });
});
