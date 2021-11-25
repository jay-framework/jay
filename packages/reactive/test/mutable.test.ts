import {describe, expect, it, jest} from '@jest/globals'
import {addMutableListener, isMutable, mutableObject, removeMutableListener} from "../lib";
import {checkModified, getRevision} from "../lib";

describe("mutable", () => {

    describe("object", () => {
        it('creates object proxy', () => {
            let mutable = mutableObject({a: 1, b:2});
            let revisioned = getRevision(mutable);

            expect(mutable.a).toBe(1)
            expect(mutable.b).toBe(2)
            expect(typeof revisioned.revNum).toBe('number')
            expect(revisioned.revNum).not.toBe(NaN)
        })

        it('creates object proxy', () => {
            let mutable = mutableObject({a: 1, b:2});

            let json = JSON.stringify(mutable);

            expect(json).not.toContain('isProxy')
            expect(json).not.toContain('listener')
            expect(json).not.toContain('original')
            expect(json).not.toContain('proxy')
            expect(json).not.toContain('revision')

        })

        it('should support property updates', () => {

            let mutable = mutableObject({a: 1, b:2});
            let revisioned = getRevision(mutable);

            mutable.a = 3

            expect(mutable.a).toBe(3)
            expect(mutable.b).toBe(2)
            let [, modified] = checkModified(mutable, revisioned);
            expect(modified).toBe(true)
        })

        it('added object should become mutable', () => {
            let mutable = mutableObject({a: {x: 1}, b:{x: 2}});
            let revision = getRevision(mutable);

            mutable.a = {x: 3};

            expect(isMutable(mutable.a)).toBe(true);
            let [, modified] = checkModified(mutable, revision);
            expect(modified).toBe(true)
        })

        it('should support property deletes', () => {
            let mutable = mutableObject({a: 1, b:2});
            let revisioned = getRevision(mutable);

            delete mutable.a

            expect(mutable.a).toBe(undefined)
            expect(mutable.b).toBe(2)
            let [, modified] = checkModified(mutable, revisioned);
            expect(modified).toBe(true)
        })

        it('removed child mutable should stop updating parent', () => {
            let mutable = mutableObject({a: {x: 1}, b:{x: 2}});
            let x1 = mutable.a;
            mutable.a = {x: 3};
            let revision = getRevision(mutable);

            x1.x = 7;

            let [, modified] = checkModified(mutable, revision);
            expect(modified).toBe(false)
        })
    })

    describe("array", () => {
        it('should create mutable array', () => {
            let mutableArr = mutableObject([1,2,3]);
            let revisioned = getRevision(mutableArr);

            expect(Array.isArray(mutableArr)).toBe(true);
            expect(typeof revisioned.revNum).toBe('number')
            expect(revisioned.revNum).not.toBe(NaN)
        })

        it('should support set element', () => {
            let mutableArr = mutableObject([1,2,3]);
            let revisioned = getRevision(mutableArr);
            mutableArr[1] = 4
            let [, modified] = checkModified(mutableArr, revisioned);

            expect(mutableArr).toEqual([1,4,3]);
            expect(modified).toBe(true)
        })

        it('should support copyWithin element', () => {
            let mutableArr = mutableObject(['a', 'b', 'c', 'd', 'e']);
            let revisioned = getRevision(mutableArr);

            mutableArr.copyWithin(0, 3, 4);
            let [revisioned2, modified] = checkModified(mutableArr, revisioned);
            expect(mutableArr).toEqual(["d", "b", "c", "d", "e"]);
            expect(modified).toBe(true)

            mutableArr.copyWithin(1, 3);
            [, modified] = checkModified(mutableArr, revisioned2);
            expect(mutableArr).toEqual(["d", "d", "e", "d", "e"]);
            expect(modified).toBe(true)
        })

        it('should support array entries', () => {
            let mutableArr = mutableObject(['a', 'b', 'c']);
            let revisioned = getRevision(mutableArr);

            const iterator1 = mutableArr.entries();
            let [, modified] = checkModified(mutableArr, revisioned);

            expect(iterator1.next().value).toEqual([0, "a"])
            expect(iterator1.next().value).toEqual([1, "b"])
            expect(modified).toBe(false)
        })

        describe('every', () => {
            it('should support primitives', () => {
                let mutableArr = mutableObject([1, 30, 39, 29, 10, 13]);
                let revisioned = getRevision(mutableArr);
                const isBelowThreshold = (currentValue) => currentValue < 40;

                expect(mutableArr.every(isBelowThreshold)).toEqual(true)
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false)
            });

            it('should support objects', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item0 = mutableArr[0];
                let item1 = mutableArr[1];
                let item2 = mutableArr[2];
                const areAllItemsPresent = (_) => _ === item0 || _ === item1 || _ === item2;

                expect(mutableArr.every(areAllItemsPresent)).toEqual(true)
            });
        })

        it('should support fill', () => {
            let mutableArr = mutableObject([1, 2, 3, 4]);
            let revisioned = getRevision(mutableArr);

            expect(mutableArr.fill(0, 2, 4)).toEqual([1, 2, 0, 0]);
            let [revisioned2, modified2] = checkModified(mutableArr, revisioned);
            expect(mutableArr.fill(5, 1)).toEqual([1, 5, 5, 5]);
            let [revisioned3, modified3] = checkModified(mutableArr, revisioned2);
            expect(mutableArr.fill(6)).toEqual([6, 6, 6, 6]);
            let [, modified4] = checkModified(mutableArr, revisioned3);
            expect(modified2).toBe(true);
            expect(modified3).toBe(true);
            expect(modified4).toBe(true);
        })

        describe('filter', () => {
            it('on primitives', () => {
                let mutableArr = mutableObject(['spray', 'limit', 'elite', 'exuberant', 'destruction', 'present']);
                let revisioned = getRevision(mutableArr);

                const result = mutableArr.filter(word => word.length > 6);

                expect(result).toEqual(["exuberant", "destruction", "present"]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
                expect(isMutable(result)).toBe(true);
            })

            it('on objects', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                let revisioned = getRevision(mutableArr);

                const result = mutableArr.filter(item => item.a > 2);

                expect(result).toEqual([{a: 3, b: 4}, {a: 5, b: 6}]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('filter on object should return mutable array', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);

                const result = mutableArr.filter(item => item.a > 2);

                expect(isMutable(result)).toBe(true);
            })

            it('filter on objects should respect the same mutable listeners', () => {
                let fn1 = jest.fn();
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                addMutableListener(mutableArr, fn1);

                const result = mutableArr.filter(item => item.a > 2);
                result[0].a = 7;
                mutableArr[2].a = 9;
                
                expect(fn1.mock.calls.length).toBe(2);
            })

            it('find function parameter should be the same proxy as when getting using index', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item1 = mutableArr[1];

                let filteredArray = mutableArr.filter(_ => _ !== item1)

                expect(filteredArray.length).toBe(2);
            })

            it('remove from original and add to filtered array should respect change listener', () => {
                let fn1 = jest.fn();
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}, {a: 7, b: 8}]);
                let item3 = mutableArr[3];
                addMutableListener(mutableArr, fn1);

                const result = mutableArr.filter(item => item.a > 2);
                removeMutableListener(mutableArr, fn1);
                addMutableListener(result, fn1);
                result[0].a = 7;
                expect(fn1.mock.calls.length).toBe(1);

                mutableArr[2].a = 9;
                expect(fn1.mock.calls.length).toBe(1);

                item3.a = 10;
                expect(fn1.mock.calls.length).toBe(2);
            })
        })

        describe('find', () => {
            it('should support find', () => {
                let mutableArr = mutableObject([5, 12, 8, 130, 44]);
                let revisioned = getRevision(mutableArr);

                const found = mutableArr.find(element => element > 10);

                expect(found).toEqual(12);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('should return mutable object', () => {
                let mutableArr = mutableObject([{a: 1, b: 4}, {a: 2, b: 5}, {a: 3, b: 6}]);

                const found = mutableArr.find(_ => _.a === 2)

                expect(isMutable(found)).toBe(true);
            })

            it('returned object should respect the same mutable listeners', () => {
                let fn1 = jest.fn();
                let mutableArr = mutableObject([{a: 1, b: 4}, {a: 2, b: 5}, {a: 3, b: 6}]);
                addMutableListener(mutableArr, fn1);

                const found = mutableArr.find(_ => _.a === 2)
                found.b = 9;

                expect(fn1.mock.calls.length).toBe(1);
            })

            it('find function parameter should be the same proxy as when getting using index', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item1 = mutableArr[1];

                let foundItem = mutableArr.find(_ => _ === item1)

                expect(foundItem).toBeDefined();
            })
        })

        describe('findIndex', () => {
            it('should support primitives', () => {
                let mutableArr = mutableObject([5, 12, 8, 130, 44]);
                let revisioned = getRevision(mutableArr);
                const isLargeNumber = (element) => element > 13;

                expect(mutableArr.findIndex(isLargeNumber)).toEqual(3);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('should support objects', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item1 = mutableArr[1];

                expect(mutableArr.findIndex(_ => _ === item1)).toEqual(1);
            })
        })

        describe('flat', () => {
            it('should support flat', () => {
                let mutableArr = mutableObject([0, 1, 2, [3, 4]]);
                let mutableArr2 = mutableObject([0, 1, 2, [[[3, 4]]]]);
                let revisioned = getRevision(mutableArr);

                // @ts-ignore
                expect(mutableArr.flat()).toEqual([0, 1, 2, 3, 4]);
                // @ts-ignore
                expect(mutableArr2.flat(2)).toEqual([0, 1, 2, [3, 4]]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('should support flat', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, [{a: 3, b: 4}, {a: 5, b: 6}]]);
                let revisioned = getRevision(mutableArr);

                // @ts-ignore
                expect(mutableArr.flat()).toEqual([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('flat on object should return mutable array', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, [{a: 3, b: 4}, {a: 5, b: 6}]]);

                // @ts-ignore
                const result = mutableArr.flat();

                expect(isMutable(result)).toBe(true);
            })

            it('flat on objects should respect the same mutable listeners', () => {
                let fn1 = jest.fn();
                let mutableArr = mutableObject([{a: 1, b: 2}, [{a: 3, b: 4}, {a: 5, b: 6}]]);
                addMutableListener(mutableArr, fn1);

                // @ts-ignore
                const result = mutableArr.flat();
                result[0].a = 7;

                expect(fn1.mock.calls.length).toBe(1);
            })

        })

        describe('flatMap', () => {
            it('on primitives', () => {
                let mutableArr = mutableObject([1, 2, 3, 4]);
                let revisioned = getRevision(mutableArr);

                // @ts-ignore
                expect(mutableArr.flatMap(x => [x * 2])).toEqual([2, 4, 6, 8]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('on objects', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                let revisioned = getRevision(mutableArr);

                // @ts-ignore
                expect(mutableArr.flatMap(x => [{a: x.a}, {b: x.b}])).toEqual([{a: 1}, {b: 2}, {a: 3}, {b: 4}, {a: 5}, {b: 6}]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('flatMap on object should return mutable array', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);

                // @ts-ignore
                const result = mutableArr.flatMap(x => [{a: x.a}, {b: x.b}]);

                expect(isMutable(result)).toBe(true);
            })

            it('flatMap on objects should respect the same mutable listeners', () => {
                let fn1 = jest.fn();
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                addMutableListener(mutableArr, fn1);

                // @ts-ignore
                const result = mutableArr.flatMap(x => [{a: x.a}, {b: x.b}]);
                result[0].a = 7;

                expect(fn1.mock.calls.length).toBe(1);
            })

        })

        describe('forEach', () => {
            it('should support primitives', () => {
                let fn = jest.fn()
                let mutableArr = mutableObject(['a', 'b', 'c']);
                let revisioned = getRevision(mutableArr);

                mutableArr.forEach(_ => fn(_))

                expect(fn.mock.calls.length).toEqual(3);
                expect(fn.mock.calls[0][0]).toEqual('a');
                expect(fn.mock.calls[1][0]).toEqual('b');
                expect(fn.mock.calls[2][0]).toEqual('c');
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            });

            it('should support objects', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item0 = mutableArr[0];
                let item1 = mutableArr[1];
                let item2 = mutableArr[2];
                let found = 0;
                const handleItem = (_) => {
                    if (_ === item0 || _ === item1 || _ === item2)
                        found += 1;
                }

                mutableArr.forEach(handleItem);
                expect(found).toEqual(3);
            });
        })

        describe('includes', () => {
            it('should support primitives', () => {
                let mutableArr = mutableObject([1, 2, 3]);
                let mutableArr2 = mutableObject(['cat', 'dog', 'bat']);
                let revisioned = getRevision(mutableArr);

                expect(mutableArr.includes(2)).toEqual(true);
                expect(mutableArr2.includes('cat')).toEqual(true);
                expect(mutableArr2.includes('at')).toEqual(false);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            });

            it('should support objects', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item1 = mutableArr[1];

                expect(mutableArr.includes(item1)).toEqual(true);
            });
        })

        it('should support join', () => {
            let mutableArr = mutableObject(['Fire', 'Air', 'Water']);
            let revisioned = getRevision(mutableArr);

            expect(mutableArr.join()).toEqual("Fire,Air,Water");
            expect(mutableArr.join('')).toEqual("FireAirWater");
            expect(mutableArr.join('-')).toEqual("Fire-Air-Water");
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(false);
        })

        it('should support keys', () => {
            let mutableArr = mutableObject(['a', 'b', 'c']);
            let revisioned = getRevision(mutableArr);

            const iterator = mutableArr.keys();
            expect(iterator.next().value).toEqual(0);
            expect(iterator.next().value).toEqual(1);
            expect(iterator.next().value).toEqual(2);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(false);
        })

        describe('lastIndexOf', () => {
            it('should support primitives', () => {
                let mutableArr = mutableObject(['Dodo', 'Tiger', 'Penguin', 'Dodo']);
                let revisioned = getRevision(mutableArr);

                expect(mutableArr.lastIndexOf('Dodo')).toEqual(3);
                expect(mutableArr.lastIndexOf('Tiger')).toEqual(1);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            });

            it('should support objects', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item1 = mutableArr[1];

                expect(mutableArr.lastIndexOf(item1)).toEqual(1);
            })
        })

        describe('map', () => {
            it('on primitives', () => {
                let mutableArr = mutableObject([1, 4, 9, 16]);
                let revisioned = getRevision(mutableArr);

                let result = mutableArr.map(x => x * 2);
                expect(result).toEqual([2, 8, 18, 32]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
                expect(isMutable(result)).toBe(true);
            })

            it('on objects', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                let revisioned = getRevision(mutableArr);

                const result = mutableArr.map(item => {item.a *= 2; return item});

                expect(result).toEqual([{a: 2, b: 2}, {a: 6, b: 4}, {a: 10, b: 6}]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('map on object should return mutable array', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);

                const result = mutableArr.map(item => {item.a *= 2; return item});

                expect(isMutable(result)).toBe(true);
            })

            it('map on objects should respect the same mutable listeners', () => {
                let fn1 = jest.fn();
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                addMutableListener(mutableArr, fn1);

                const result = mutableArr.map(item => {item.a *= 2; return item});
                result[0].a = 7;

                expect(fn1.mock.calls.length).toBe(1);
            })
        })

        it('should support pop', () => {
            let mutableArr = mutableObject(['broccoli', 'cauliflower', 'cabbage', 'kale', 'tomato']);
            let revisioned = getRevision(mutableArr);

            expect(mutableArr.pop()).toEqual("tomato");
            let [revisioned2, modified2] = checkModified(mutableArr, revisioned);
            expect(mutableArr).toEqual(["broccoli", "cauliflower", "cabbage", "kale"]);
            expect(modified2).toBe(true);

            expect(mutableArr.pop()).toEqual("kale");
            let [, modified3] = checkModified(mutableArr, revisioned2);
            expect(mutableArr).toEqual(["broccoli", "cauliflower", "cabbage"]);
            expect(modified3).toBe(true);
        })

        it('should support push', () => {
            let mutableArr = mutableObject([1,2,3]);
            let revisioned = getRevision(mutableArr);

            mutableArr.push(4)
            let [revisioned2, modified2] = checkModified(mutableArr, revisioned);
            expect(mutableArr).toEqual([1,2,3,4]);
            expect(modified2).toBe(true);

            mutableArr.push(5,6,7)
            let [, modified3] = checkModified(mutableArr, revisioned2);
            expect(mutableArr).toEqual([1,2,3,4,5,6,7]);
            expect(modified3).toBe(true);
        })

        it('should support reduce', () => {
            let mutableArr = mutableObject([1,2,3,4]);
            let revisioned = getRevision(mutableArr);
            const reducer = (previousValue, currentValue) => previousValue + currentValue;

            expect(mutableArr.reduce(reducer)).toEqual(10);
            expect(mutableArr.reduce(reducer, 5)).toEqual(15);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(false);
        })

        it('should support reduceRight', () => {
            let mutableArr = mutableObject([[0, 1], [2, 3], [4, 5]]);
            let revisioned = getRevision(mutableArr);
            const reducer = (accumulator, currentValue) => accumulator.concat(currentValue)

            expect(mutableArr.reduceRight(reducer)).toEqual([4, 5, 2, 3, 0, 1]);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(false);
        })

        describe('reverse', () => {
            it('should support reverse', () => {
                let mutableArr = mutableObject(['one', 'two', 'three']);
                let revisioned = getRevision(mutableArr);

                let result = mutableArr.reverse();
                expect(result).toEqual(["three", "two", "one"]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(true);
                expect(isMutable(result)).toBe(true);
            })

            it('on objects', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                let revisioned = getRevision(mutableArr);

                const result = mutableArr.reverse();

                expect(result).toEqual([{a: 5, b: 6}, {a: 3, b: 4}, {a: 1, b: 2}]);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(true);
            })

            it('reverse on object should return the same array', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);

                const result = mutableArr.reverse();

                expect(result === mutableArr).toBe(true);
            })

        })

        it('should support shift', () => {
            let mutableArr = mutableObject([1, 2, 3]);
            let revisioned = getRevision(mutableArr);

            const firstElement = mutableArr.shift()

            expect(mutableArr).toEqual([2, 3]);
            expect(firstElement).toEqual(1);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(true);
        })

        it('should support slice', () => {
            let mutableArr = mutableObject(['ant', 'bison', 'camel', 'duck', 'elephant']);
            let revisioned = getRevision(mutableArr);

            expect(mutableArr.slice(2)).toEqual(["camel", "duck", "elephant"]);
            expect(mutableArr.slice(2, 4)).toEqual(["camel", "duck"]);
            expect(mutableArr.slice(1, 5)).toEqual(["bison", "camel", "duck", "elephant"]);
            expect(mutableArr.slice(-2)).toEqual(["duck", "elephant"]);
            expect(mutableArr.slice(2, -1)).toEqual(["camel", "duck"]);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(false);
        })

        describe('some', () => {
            it('should support primitives', () => {
                let mutableArr = mutableObject([1, 2, 3, 4, 5]);
                let revisioned = getRevision(mutableArr);

                const even = (element) => element % 2 === 0;

                expect(mutableArr.some(even)).toEqual(true);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('should support objects', () => {
                let mutableArr = mutableObject([{a: 1}, {a: 2}, {a: 3}]);
                let item1 = mutableArr[1];
                const areAllItemsPresent = (_) => _ === item1;

                expect(mutableArr.some(areAllItemsPresent)).toEqual(true)
            });

        })

        it('should support sort', () => {
            let mutableArr = mutableObject(['March', 'Jan', 'Feb', 'Dec']);
            let revisioned = getRevision(mutableArr);
            let mutableArr2 = mutableObject([1, 30, 4, 21, 100000]);
            let revisioned2 = getRevision(mutableArr2);

            mutableArr.sort()
            mutableArr2.sort()

            expect(mutableArr).toEqual(["Dec", "Feb", "Jan", "March"]);
            expect(mutableArr2).toEqual([1, 100000, 21, 30, 4]);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(true);
            let [, modified2] = checkModified(mutableArr2, revisioned2);
            expect(modified2).toBe(true);
        })

        it('should support splice', () => {
            let mutableArr = mutableObject(['Jan', 'March', 'April', 'June']);
            let revisioned = getRevision(mutableArr);

            mutableArr.splice(1, 0, 'Feb')
            expect(mutableArr).toEqual(["Jan", "Feb", "March", "April", "June"]);
            let [revisioned2, modified2] = checkModified(mutableArr, revisioned);

            mutableArr.splice(4, 1, 'May')
            expect(mutableArr).toEqual(["Jan", "Feb", "March", "April", "May"]);
            let [, modified3] = checkModified(mutableArr, revisioned2);
            expect(modified2).toBe(true);
            expect(modified3).toBe(true);
        })

        it('should support toString', () => {
            let mutableArr = mutableObject([1, 2, 'a', '1a']);
            let revisioned = getRevision(mutableArr);

            expect(mutableArr.toString()).toEqual("1,2,a,1a");
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(false);
        })

        it('should support unshift', () => {
            let mutableArr = mutableObject([1, 2, 3]);
            let revisioned = getRevision(mutableArr);

            expect(mutableArr.unshift(4, 5)).toEqual(5);
            expect(mutableArr).toEqual([4, 5, 1, 2, 3]);
            let [, modified] = checkModified(mutableArr, revisioned);
            expect(modified).toBe(true);
        })

        describe('values', () => {
            it('should support values', () => {
                let mutableArr = mutableObject(['a', 'b', 'c']);
                let revisioned = getRevision(mutableArr);

                const iterator = mutableArr.values();
                let a = iterator.next().value;
                let b = iterator.next().value;
                let c = iterator.next().value
                expect(a).toEqual('a');
                expect(b).toEqual('b');
                expect(c).toEqual('c');
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })

            it('should support values', () => {
                let mutableArr = mutableObject([{a: 1, b: 2}, {a: 3, b: 4}, {a: 5, b: 6}]);
                let revisioned = getRevision(mutableArr);

                const iterator = mutableArr.values();
                let a = iterator.next().value;
                let b = iterator.next().value;
                let c = iterator.next().value
                expect(a).toEqual({a: 1, b: 2});
                expect(b).toEqual({a: 3, b: 4});
                expect(c).toEqual({a: 5, b: 6});
                expect(isMutable(a)).toBe(true);
                expect(isMutable(b)).toBe(true);
                expect(isMutable(c)).toBe(true);
                let [, modified] = checkModified(mutableArr, revisioned);
                expect(modified).toBe(false);
            })
        })
    })

    describe('nested objects', () => {
        it('should support object in object', () => {
            let mutable = mutableObject({
                a: 1,
                b: 2,
                c: {d: 4, e: 5}
            });
            let rootRevision = getRevision(mutable);
            let childRevision = getRevision(mutable.c);

            mutable.c.d = 7;

            let [, rootModified] = checkModified(mutable, rootRevision);
            let [, childModified] = checkModified(mutable.c, childRevision);

            expect(rootModified).toBe(true);
            expect(childModified).toBe(true);
        })

        it('should support object in array', () => {
            let mutable = mutableObject([
                {a: 1, b: 2},
                {a: 3, b: 4},
                {a: 5, b: 6}
            ]);
            let rootRevision = getRevision(mutable);
            let child1Revision = getRevision(mutable[0]);
            let child2Revision = getRevision(mutable[1]);
            let child3Revision = getRevision(mutable[2]);

            mutable[1].a = 7;

            let [, rootModified] = checkModified(mutable, rootRevision);
            let [, child1Modified] = checkModified(mutable[0], child1Revision);
            let [, child2Modified] = checkModified(mutable[1], child2Revision);
            let [, child3Modified] = checkModified(mutable[2], child3Revision);

            expect(rootModified).toBe(true);
            expect(child1Modified).toBe(false);
            expect(child2Modified).toBe(true);
            expect(child3Modified).toBe(false);
        })

        it('should support array in object', () => {
            let mutable = mutableObject({
                a: 1,
                b: 2,
                c: [3,4,5]
        });
            let rootRevision = getRevision(mutable);
            let childRevision = getRevision(mutable.c);

            mutable.c.push(4);

            let [, rootModified] = checkModified(mutable, rootRevision);
            let [, childModified] = checkModified(mutable.c, childRevision);

            expect(rootModified).toBe(true);
            expect(childModified).toBe(true);
        })

        it('should support re-adding a proxied child as proxy, while storing the raw object', () => {
            let raw = {
                a: 1,
                b: 2,
                c: {d: 4, e: 5},
                d: undefined
            };
            let mutable = mutableObject(raw);

            mutable.d = mutable.c;

            expect(isMutable(raw.d)).toBe(false);
        })
    })

    describe("isMutable", () => {
        it('for mutable object', () => {
            let mutable = mutableObject({a: 1, b:2});

            expect(isMutable(mutable)).toBe(true)
        })

        it('for mutable array', () => {
            let mutableArr = mutableObject([1,2,3]);

            expect(isMutable(mutableArr)).toBe(true)
        })

        it('for regular object', () => {
            let mutable = {a: 1, b:2};

            expect(isMutable(mutable)).toBe(false)
        })

        it('for regular array', () => {
            let mutableArr = [1,2,3];

            expect(isMutable(mutableArr)).toBe(false)
        })
    })

    describe("mutation listener", () => {
        it('supports change listener in mutableObject', () => {
            let fn = jest.fn();
            let mutable = mutableObject({a: 1, b:2}, fn);

            mutable.a = 3;

            expect(fn.mock.calls.length).toBe(1);
        })

        it('supports change listener in mutableObject', () => {
            let fn = jest.fn();
            let mutable = mutableObject({a: 1, b:2});
            addMutableListener(mutable, fn);

            mutable.a = 3;

            expect(fn.mock.calls.length).toBe(1);
        })

        it('supports removing change listener in mutableObject', () => {
            let fn1 = jest.fn();
            let fn2 = jest.fn();
            let mutable = mutableObject({a: 1, b:2});
            addMutableListener(mutable, fn1);
            addMutableListener(mutable, fn2);
            removeMutableListener(mutable, fn1);

            mutable.a = 3;

            expect(fn1.mock.calls.length).toBe(0);
            expect(fn2.mock.calls.length).toBe(1);
        })

        it('supports change listener in array of objects', () => {
            let fn = jest.fn();
            let mutable = mutableObject([{a: 1, b:2}, {a: 3, b:4}, {a: 5, b:6}], fn);

            mutable[1].a = 3;

            expect(fn.mock.calls.length).toBe(1);
        })
    })
})