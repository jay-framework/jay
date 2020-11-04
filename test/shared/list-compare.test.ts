import {listCompare, ITEM_ADDED, ITEM_REMOVED, ITEM_MOVED} from '../../examples/list-compare';

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

    function applyCompare(array, instructions) {
        let res = [...array];
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
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return add instruction for a new item at the middle', () =>{
        let oldList = [itemA, itemB];
        let newList = [itemA, itemC, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_ADDED, item: itemC, pos: 1}])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return remove instruction for a removed item', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemC];

        let matchResults = listCompare(oldList, newList, 'id');
        process.stdout.write(require('util').inspect(matchResults) + '\n');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_REMOVED, item: itemB, pos: 1}])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return remove instruction for a removed item at the end', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_REMOVED, item: itemC, pos: 2}])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return remove instruction for multiple removed item at the end', () =>{
        let oldList = [itemA, itemB, itemC, itemD, itemE];
        let newList = [itemA, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(3);
        expect(matchResults).toEqual([
            {action: ITEM_REMOVED, item: itemC, pos: 2},
            {action: ITEM_REMOVED, item: itemD, pos: 2},
            {action: ITEM_REMOVED, item: itemE, pos: 2}
        ])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return move instruction a moved item', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemA, itemC, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2}])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it.skip('should optimize move instruction a moved item forward', () =>{
        let oldList = [itemA, itemB, itemC, itemD, itemE];
        let newList = [itemA, itemC, itemD, itemE, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        // expect(matchResults.length).toBe(1);
        // expect(matchResults).toEqual([
        //     {action: ITEM_MOVED, item: itemB, pos: 4, fromPos: 1}
        //     ]);
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return move instruction for multiple moved items forward', () =>{
        let oldList = [itemA, itemB, itemC, itemD, itemE];
        let newList = [itemA, itemC, itemE, itemD, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(3);
        expect(matchResults).toEqual([
            {action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 2},  // new index 1 -> 2    old 1
            {action: ITEM_MOVED, item: itemE, pos: 2, fromPos: 4},  // new index 2 -> 3  old 1
            {action: ITEM_MOVED, item: itemD, pos: 3, fromPos: 4}   //
        ]);
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return move instruction a moved item backward', () =>{
        let oldList = [itemA, itemB, itemC, itemD, itemE];
        let newList = [itemA, itemE, itemB, itemC, itemD];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(1);
        expect(matchResults).toEqual([{action: ITEM_MOVED, item: itemE, pos: 1, fromPos: 4}])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return instructions for reshuffle', () =>{
        let oldList = [itemA, itemB, itemC];
        let newList = [itemE, itemC, itemD, itemA, itemB];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(3);
        expect(matchResults).toEqual([
            {action: ITEM_ADDED, item: itemE, pos: 0},
            {action: ITEM_MOVED, item: itemC, pos: 1, fromPos: 3},
            {action: ITEM_ADDED, item: itemD, pos: 2}
            ])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return instructions for move then remove', () =>{
        let oldList = [item18, item21, item36, item39, item42, item3, item48];
        let newList = [item18, item39, item21, item42, item3, item48];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(2);
        expect(matchResults).toEqual([
            {action: ITEM_MOVED, item: item39, pos: 1, fromPos: 3},
            {action: ITEM_REMOVED, item: item36, pos: 3}
        ])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it('should return instructions for remove then move', () =>{
        let oldList = [item18, item21, item36, item39, item42];
        let newList = [item18, item21, item42, item39];

        let matchResults = listCompare(oldList, newList, 'id');

        expect(matchResults.length).toBe(2);
        expect(matchResults).toEqual([
            {action: ITEM_REMOVED, item: item36, pos: 2},
            {action: ITEM_MOVED, item: item42, pos: 2, fromPos: 3}
        ])
        let mutatedList = applyCompare(oldList, matchResults);
        expect(mutatedList).toEqual(newList);
    });

    it.skip('...', () => {
        let oldList = [
            { id: 'a1734' }, { id: 'a1776' }, { id: 'a1759' }, { id: 'a1717' },
            { id: 'a1733' }, { id: 'a1774' }, { id: 'a1778' }, { id: 'a1725' },
            { id: 'a1783' }, { id: 'a1654' }, { id: 'a1744' }, { id: 'a1728' },
            { id: 'a1780' }, { id: 'a1712' }, { id: 'a1625' }, { id: 'a1662' },
            { id: 'a1651' }, { id: 'a1557' }, { id: 'a1681' }, { id: 'a1700' },
            { id: 'a1692' }, { id: 'a1771' }, { id: 'a1768' }, { id: 'a1772' },
            { id: 'a1745' }, { id: 'a1754' }, { id: 'a1782' }, { id: 'a1732' },
            { id: 'a1770' }, { id: 'a1760' }, { id: 'a1752' }, { id: 'a1699' },
            { id: 'a1749' }, { id: 'a1716' }, { id: 'a1764' }, { id: 'a1706' },
            { id: 'a1688' }, { id: 'a1676' }, { id: 'a1698' }, { id: 'a1687' },
            { id: 'a1736' }, { id: 'a1668' }, { id: 'a1689' }, { id: 'a1735' },
            { id: 'a1755' }, { id: 'a1758' }, { id: 'a1767' }, { id: 'a1773' },
            { id: 'a1730' }, { id: 'a1746' }, { id: 'a1747' }, { id: 'a1695' },
            { id: 'a1616' }, { id: 'a1683' }, { id: 'a1634' }, { id: 'a1705' },
            { id: 'a1781' }, { id: 'a1443' }, { id: 'a1756' }, { id: 'a1684' },
            { id: 'a1779' }, { id: 'a1722' }, { id: 'a1667' }, { id: 'a1631' },
            { id: 'a1551' }, { id: 'a1761' }, { id: 'a1655' }, { id: 'a1757' },
            { id: 'a1685' }
        ];

        // let oldList = [
        //     { id: 'a1776' }, { id: 'a1822' }, { id: 'a1717' }, { id: 'a1770' }, // 3
        //     { id: 'a1813' }, { id: 'a1778' }, { id: 'a1801' }, { id: 'a1810' }, // 7
        //     { id: 'a1812' }, { id: 'a1808' }, { id: 'a1654' }, { id: 'a1728' }, // 11
        //     { id: 'a1754' }, { id: 'a1784' }, { id: 'a1816' }, { id: 'a1712' }, // 15
        //     { id: 'a1758' }, { id: 'a1655' }, { id: 'a1662' }, { id: 'a1814' }, // 19
        //     { id: 'a1681' }, { id: 'a1793' }, { id: 'a1700' }, { id: 'a1787' }, // 23
        //     { id: 'a1716' }, { id: 'a1824' }, { id: 'a1692' }, { id: 'a1818' }, // 27
        //     { id: 'a1760' }, { id: 'a1551' }, { id: 'a1819' }, { id: 'a1772' }, // 31
        //     { id: 'a1805' }, { id: 'a1782' }, { id: 'a1732' }, { id: 'a1752' }, // 35
        //     { id: 'a1823' }, { id: 'a1687' }, { id: 'a1705' }, { id: 'a1756' }, // 39
        //     { id: 'a1764' }, { id: 'a1706' }, { id: 'a1807' }, { id: 'a1788' }, // 43
        //     { id: 'a1676' }, { id: 'a1736' }, { id: 'a1689' }, { id: 'a1735' }, // 47
        //     { id: 'a1557' }, { id: 'a1809' }, { id: 'a1699' }, { id: 'a1767' }, // 51
        //     { id: 'a1668' }, { id: 'a1730' }, { id: 'a1746' }, { id: 'a1794' }, // 55
        //     { id: 'a1792' }, { id: 'a1773' }, { id: 'a1747' }, { id: 'a1695' }, // 59
        //     { id: 'a1616' }, { id: 'a1771' }, { id: 'a1781' }, { id: 'a1779' }, // 63
        //     { id: 'a1722' }, { id: 'a1811' }, { id: 'a1821' }, { id: 'a1817' }, // 67
        //     { id: 'a1761' }, { id: 'a1790' }, { id: 'a1774' }, { id: 'a1815' }, // 71
        //     { id: 'a1800' }, { id: 'a1780' }, { id: 'a1820' }, { id: 'a1803' }, // 75
        //     { id: 'a1757' }, { id: 'a1634' }, { id: 'a1667' }, { id: 'a1685' }, /// 79
        //     { id: 'a1798' }, { id: 'a1745' },
        //
        //     { id: 'a1749' }, { id: 'a1688' }, { id: 'a1698' }, // 82
        //     { id: 'a1755' }, { id: 'a1683' },  // 84
        //     { id: 'a1443' }, { id: 'a1684' }, // 86
        //     { id: 'a1631' },
        // ];

        let newList = [
            { id: 'a1776' }, { id: 'a1822' }, { id: 'a1717' }, { id: 'a1770' },
            { id: 'a1813' }, { id: 'a1778' }, { id: 'a1801' }, { id: 'a1810' },
            { id: 'a1812' }, { id: 'a1808' }, { id: 'a1654' }, { id: 'a1728' },
            { id: 'a1754' }, { id: 'a1784' }, { id: 'a1816' }, { id: 'a1712' },
            { id: 'a1758' }, { id: 'a1655' }, { id: 'a1662' }, { id: 'a1814' },
            { id: 'a1681' }, { id: 'a1793' }, { id: 'a1700' }, { id: 'a1787' },
            { id: 'a1716' }, { id: 'a1824' }, { id: 'a1692' }, { id: 'a1818' },
            { id: 'a1760' }, { id: 'a1551' }, { id: 'a1819' }, { id: 'a1772' },
            { id: 'a1805' }, { id: 'a1782' }, { id: 'a1732' }, { id: 'a1752' },
            { id: 'a1823' }, { id: 'a1687' }, { id: 'a1705' }, { id: 'a1756' },
            { id: 'a1764' }, { id: 'a1706' }, { id: 'a1807' }, { id: 'a1788' },
            { id: 'a1676' }, { id: 'a1736' }, { id: 'a1689' }, { id: 'a1735' },
            { id: 'a1557' }, { id: 'a1809' }, { id: 'a1699' }, { id: 'a1767' },
            { id: 'a1668' }, { id: 'a1730' }, { id: 'a1746' }, { id: 'a1796' },
            { id: 'a1792' }, { id: 'a1773' }, { id: 'a1747' }, { id: 'a1695' },
            { id: 'a1616' }, { id: 'a1771' }, { id: 'a1781' }, { id: 'a1779' },
            { id: 'a1722' }, { id: 'a1811' }, { id: 'a1821' }, { id: 'a1817' },
            { id: 'a1761' }, { id: 'a1790' }, { id: 'a1774' }, { id: 'a1815' },
            { id: 'a1800' }, { id: 'a1780' }, { id: 'a1820' }, { id: 'a1803' },
            { id: 'a1757' }, { id: 'a1634' }, { id: 'a1667' }, { id: 'a1685' },
            { id: 'a1798' }, { id: 'a1745' }
        ];

        let matchResults = listCompare(oldList, newList, 'id');
        console.log(matchResults)
        let mutatedList = applyCompare(oldList, matchResults);
        console.log(mutatedList, newList);
        expect(mutatedList).toEqual(newList);
    })

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
                else {
                    let pos2 = Math.floor(Math.random()*(newArr.length));
                    let x = newArr.splice(pos, 1);
                    if (x[0] === undefined)
                        console.log('******', x, i, pos, pos2, newArr.length)
                    newArr.splice(pos2, 0, x[0]);
                }
            }
            it('should handle extreme shaking ' + i, () => {
                let matchResults = listCompare(arr, newArr, 'id');

                let mutatedList = applyCompare(arr, matchResults);
                expect(mutatedList).toEqual(newArr);
            });
           console.log(i, arr, newArr)
            arr = newArr;
        }
    })

});

