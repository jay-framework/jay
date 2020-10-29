import {END, RandomAccessLinkedList} from '../../examples/random-access-linked-list';

const item = (id, val) => {return {id, val}};

const itemA = item('a', 123);
const itemB = item('b', 456);
const itemC = item('c', 789);
const itemD = item('d', 1234);
const itemE = item('e', 2345);
const itemX = item('x', 2345);

describe('random-access-linked-list', () => {
    it('create a list from array', () => {
        const arr = [itemA, itemB, itemC, itemD, itemE];

        const list = new RandomAccessLinkedList(arr, 'id');

        expect(list.first().value).toBe(itemA);
        expect(list.first().next.value).toBe(itemB);
        expect(list.first().next.next.value).toBe(itemC);
        expect(list.first().next.next.next.value).toBe(itemD);
        expect(list.first().next.next.next.next.value).toBe(itemE);
        expect(list.first().next.next.next.next.next).toBe(END);
    });

    it('allows random access to middle of the list by id', () => {
        const arr = [itemA, itemB, itemC, itemD, itemE];

        const list = new RandomAccessLinkedList(arr, 'id');

        expect(list.get(itemC.id).value).toBe(itemC);
        expect(list.get(itemC.id).next.value).toBe(itemD);
        expect(list.get(itemC.id).next.next.value).toBe(itemE);
        expect(list.get(itemC.id).next.next.next).toBe(END);
    });

    it('supports has', () => {
        const arr = [itemA, itemB, itemC, itemD, itemE];

        const list = new RandomAccessLinkedList(arr, 'id');

        expect(list.has(itemC.id)).toBe(true);
        expect(list.has(itemX.id)).toBe(false);
    });
});
