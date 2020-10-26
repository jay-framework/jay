import {listCompare, ITEM_ADDED, ITEM_REMOVED, ITEM_MOVED} from '../../examples/list-compare';

const item = (id, val) => {return {id, val}};

const itemA = item('a', 123);
const itemB = item('b', 456);
const itemC = item('c', 789);
const itemD = item('d', 1234);
const itemE = item('e', 2345);

describe('list-compare', () => {
    it('should return empty result for identical lists', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemB, itemC];
        expect(listCompare(oldList, newList, 'id').length).toBe(0);
    });

    it('should return add instruction for a new item at the end', () =>{
        let oldList = [itemA, itemB];
        let newList = [itemA, itemB, itemC];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_ADDED, item: itemC, pos: 2}])
    });

    it('should return add instruction for a new item at the middle', () =>{
        let oldList = [itemA, itemB];
        let newList = [itemA, itemC, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_ADDED, item: itemC, pos: 1}])
    });

    it('should return remove instruction for a removed item', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemC];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_REMOVED, item: itemB, pos: 1}])
    });

    it('should return remove instruction for a removed item and the end', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_REMOVED, item: itemC, pos: 2}])
    });

    it('should return move instruction a moved item', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemC, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_MOVED, item: itemC, pos: 1}])
    });

    it('should return instructions for reshuffle', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemE, itemC, itemD, itemA, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(3);
        expect(matchResults).toEqual([
            {action: ITEM_ADDED, item: itemE, pos: 0},
            {action: ITEM_MOVED, item: itemC, pos: 1},
            {action: ITEM_ADDED, item: itemD, pos: 2}
            ])
    });
});

