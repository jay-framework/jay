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
        expect(matchResults).toEqual([{action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2}])
    });

    it('should return instructions for reshuffle', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemE, itemC, itemD, itemA, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(3);
        expect(matchResults).toEqual([
            {action: ITEM_ADDED, item: itemE, pos: 0},
            {action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2},
            {action: ITEM_ADDED, item: itemD, pos: 2}
            ])
    });

    it('should return instructions for remove and move', () =>{
        let item18 = {name: "item 18", completed: false, cost: 18, id: "a18"};
        let item21 = {name: "item 21", completed: true, cost: 21, id: "a21"};
        let item39 = {name: "item 39", completed: true, cost: 39, id: "a39"};
        let item36 = {name: "item 36", completed: false, cost: 36, id: "a36"};
        let item42 = {name: "item 42", completed: false, cost: 42, id: "a42"};
        let item3 = {name: "item 3", completed: true, cost: 3, id: "a3"};
        let item48 = {name: "item 48", completed: false, cost: 48, id: "a48"};
        let oldList = [item18, item21, item36, item39, item42, item3, item48];
        let newList = [item18, item39, item21, item42, item3, item48];

        let matchResults = listCompare(oldList, newList, 'id');
        console.log(matchResults)
        expect(matchResults.length).toBe(2);
        expect(matchResults).toEqual([
            {action: ITEM_MOVED, item: item39, pos: 1, fromPos: 3},
            {action: ITEM_REMOVED, item: item36, pos: 2}
        ])
    });
});

