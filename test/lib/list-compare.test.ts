import {listCompare, ITEM_ADDED, ITEM_REMOVED, ITEM_MOVED} from '../../lib/list-compare';
import {TestList as List} from "./test-list";
import {describe, expect, it} from '@jest/globals'


const item = (id, val) => {return {id, val}};

const itemA = item('a', 123);
const itemB = item('b', 456);
const itemC = item('c', 789);
const itemD = item('d', 1234);
const itemE = item('e', 2345);

const item18 = {name: "item 18", completed: false, cost: 18, id: "a18"};
const item21 = {name: "item 21", completed: true, cost: 21, id: "a21"};
const item39 = {name: "item 39", completed: true, cost: 39, id: "a39"};
const item36 = {name: "item 36", completed: false, cost: 36, id: "a36"};
const item42 = {name: "item 42", completed: false, cost: 42, id: "a42"};
const item3 = {name: "item 3", completed: true, cost: 3, id: "a3"};
const item48 = {name: "item 48", completed: false, cost: 48, id: "a48"};

describe('list-compare', () => {

    function applyCompare(list: List<any>, instructions) {
        let res = list.toArray();
        instructions.forEach(instruction => {
            if (instruction.action === ITEM_ADDED) {
                res.splice(instruction.pos, 0, instruction.item)
            }
            else if (instruction.action === ITEM_REMOVED) {
                // process.stdout.write('remove ' + instruction.item.id + ' ' + instruction.pos+ '\n');
                res.splice(instruction.pos, 1)
            }
            else if (instruction.action === ITEM_MOVED) {
                let item = res.splice(instruction.fromPos, 1)[0];
                res.splice(instruction.pos, 0, item);
            }

        });
        return res;
    }

    it('should return empty result for identical lists', () =>{
        let oldList = new List([itemA, itemB, itemC], 'id');
        let newList = new List([itemA, itemB, itemC], 'id');
        expect(listCompare(oldList, newList).length).toBe(0);
    });

    it('should return add instruction for a new item at the end', () =>{
        let oldList = new List([itemA, itemB], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemB, itemC], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        console.log(oldList.toArray(), toUpdateList.toArray(), newList.toArray());
        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([{action: ITEM_ADDED, item: itemC, pos: 2}])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return add instruction for a new item at the middle', () =>{
        let oldList = new List([itemA, itemB], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemC, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([{action: ITEM_ADDED, item: itemC, pos: 1}])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return remove instruction for a removed item', () =>{
        let oldList = new List([itemA, itemB, itemC], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemC], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([{action: ITEM_REMOVED, item: itemB, pos: 1}])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return remove instruction for a removed item at the end', () =>{
        let oldList = new List([itemA, itemB, itemC], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([{action: ITEM_REMOVED, item: itemC, pos: 2}])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return remove instruction for multiple removed item at the end', () =>{
        let oldList = new List([itemA, itemB, itemC, itemD, itemE], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(3);
        expect(instructions).toEqual([
            {action: ITEM_REMOVED, item: itemC, pos: 2},
            {action: ITEM_REMOVED, item: itemD, pos: 2},
            {action: ITEM_REMOVED, item: itemE, pos: 2}
        ])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return move instruction for a moved item', () =>{
        let oldList = new List([itemA, itemB, itemC], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemC, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([{action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2}])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should optimize move instruction a moved item forward', () =>{
        let oldList = new List([itemA, itemB, itemC, itemD, itemE], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemC, itemD, itemE, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([
            {action: ITEM_MOVED, pos: 4, fromPos: 1}
            ]);
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should optimize multiple move instruction sequences', () =>{
        let oldList = new List([itemA, itemB, itemC, itemD, itemE, item3, item18, item21, item36, item39], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemC, itemD, itemE, itemB, item3, item21, item36, item39, item18], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(2);
        expect(instructions).toEqual([
            {action: ITEM_MOVED, pos: 4, fromPos: 1},
            {action: ITEM_MOVED, pos: 9, fromPos: 6}
        ]);
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return move instruction for multiple moved items forward', () =>{
        let oldList = new List([itemA, itemB, itemC, itemD, itemE], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemC, itemE, itemD, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(3);
        expect(instructions).toEqual([
            {action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2},  // new index 1 -> 2    old 1
            {action: ITEM_MOVED, item: itemE, pos: 2, fromPos: 4},  // new index 2 -> 3  old 1
            {action: ITEM_MOVED, item: itemD, pos: 3, fromPos: 4}   //
        ]);
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return move instruction a moved item backward', () =>{
        let oldList = new List([itemA, itemB, itemC, itemD, itemE], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemA, itemE, itemB, itemC, itemD], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(1);
        expect(instructions).toEqual([{action: ITEM_MOVED, item: itemE, pos: 1, fromPos: 4}])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return instructions for reshuffle', () =>{
        let oldList = new List([itemA, itemB, itemC], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([itemE, itemC, itemD, itemA, itemB], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(3);
        expect(instructions).toEqual([
            {action: ITEM_ADDED, item: itemE, pos: 0},
            {action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 3},
            {action: ITEM_ADDED, item: itemD, pos: 2}
            ])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return instructions for move then remove', () =>{
        let oldList = new List([item18, item21, item36, item39, item42, item3, item48], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([item18, item39, item21, item42, item3, item48], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(2);
        expect(instructions).toEqual([
            {action: ITEM_MOVED, item: item39, pos: 1, fromPos: 3},
            {action: ITEM_REMOVED, item: item36, pos: 3}
        ])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('should return instructions for remove then move', () =>{
        let oldList = new List([item18, item21, item36, item39, item42], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([item18, item21, item42, item39], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);

        expect(instructions.length).toBe(2);
        expect(instructions).toEqual([
            {action: ITEM_REMOVED, item: item36, pos: 2},
            {action: ITEM_MOVED, item: item42, pos: 2, fromPos: 3}
        ]);
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    it('optimize sequence in the middle of instructions array', () =>{
        let oldList = new List([
            {name: "item 114", completed: false, cost: 114, id: "a114"},
            {name: "item 33", completed: true, cost: 33, id: "a33"},     // 1 removed
            {name: "item 75", completed: true, cost: 75, id: "a75"},     // 2
            {name: "item 201", completed: true, cost: 201, id: "a201"},  // 3 moved
            {name: "item 153", completed: true, cost: 153, id: "a153"},  // 4
            {name: "item 204", completed: false, cost: 204, id: "a204"}, // 5
            {name: "item 207", completed: true, cost: 207, id: "a207"}   // 6
        ], 'id');
        let toUpdateList = oldList.clone();
        let newList = new List([
            {name: "item 114", completed: false, cost: 114, id: "a114"},
            {name: "item 75", completed: true, cost: 75, id: "a75"},     // 1
            {name: "item 153", completed: true, cost: 153, id: "a153"},  // 2
            {name: "item 204", completed: false, cost: 204, id: "a204"}, // 3
            {name: "item 207", completed: true, cost: 207, id: "a207"},  // 4
            {name: "item 210", completed: false, cost: 210, id: "a210"}, // 5 new
            {name: "item 201", completed: true, cost: 201, id: "a201"}   // 6 moved
        ], 'id');

        let instructions = listCompare(toUpdateList, newList);
        let mutatedList = applyCompare(oldList, instructions);
        expect(instructions.length).toBe(3);
        expect(instructions).toEqual([
            {action: "IR", item: {name: "item 33", completed: true, cost: 33, id: "a33"}, pos: 1},
            {action: "IM", pos: 5, fromPos: 2},
            {action: "IA", item: {name: "item 210", completed: false, cost: 210, id: "a210"}, pos: 5}
        ])
        expect(mutatedList).toEqual(newList.toArray());
        expect(toUpdateList.toArray()).toEqual(newList.toArray());
    });

    describe('shake the shake', () => {

        let length = Math.floor(Math.random()*100)+10;
        let arr = [];
        for (let i=0; i < length; i++) {
            arr.push({id: 'a'+i});
        }
        let nextId = length+1;
        for (let i=0; i < 100; i++) {
            let mutations = Math.floor(Math.random()*100)+10;
            let newArr = [...arr];
            for (let j=0; j < mutations; j++) {
                let action = Math.floor(Math.random()*3);
                let pos = Math.floor(Math.random()*newArr.length);
                if (action === 0) {
                    newArr.splice(pos, 0, {id: 'a' + nextId++});
                }
                else if (action === 1) {
                    newArr.splice(pos, 1);
                }
                else if (newArr.length > 1){
                    let pos2 = Math.floor(Math.random()*(newArr.length));
                    let x = newArr.splice(pos, 1);
                    newArr.splice(pos2, 0, x[0]);
                }
            }
            it('should handle extreme shaking ' + i, () => {
                let matchResults = listCompare(new List(arr, 'id'), new List(newArr, 'id'));

                let mutatedList = applyCompare(new List(arr, 'id'), matchResults);
                expect(mutatedList).toEqual(newArr);
            });
            arr = newArr;
        }
    })

});

