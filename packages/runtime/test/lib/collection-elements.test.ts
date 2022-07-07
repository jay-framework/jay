import {
    forEach,
    dynamicElement as de,
    JayElement,
    element as e,
    dynamicText as dt, ConstructContext
} from '../../lib/element';
import {describe, expect, it} from '@jest/globals'
import {expectE} from "./test-utils";
import {DynamicReference} from "../../lib";
import { mutableObject } from 'jay-reactive';

const item1 = {name: 'name 1', id: 'id-1'};
const item2 = {name: 'name 2', id: 'id-2'};
const item2_1 = {name: 'name 2_1', id: 'id-2'};
const item3 = {name: 'name 3', id: 'id-3'};
const item4 = {name: 'name 4', id: 'id-4'};
const item5 = {name: 'name 5', id: 'id-5'};

describe('collection-element', () => {

    interface Item {
        name: string
        id: string
    }

    interface ViewState {
        items: Array<Item>;
    }

    describe('rendering', () => {

        function makeElement(data: ViewState): JayElement<ViewState, any> {
            return ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    forEach(
                        (newViewState) => newViewState.items,
                        (item: Item) => {
                            return e('div', {"class":"item", id: item.id}, [dt(item => item.name)])
                        },
                        'id'
                    )
                ])
            )
        }

        it('should render empty collection', () => {
            let jayElement = makeElement({items: []});
            expect(jayElement.dom.querySelector('.item')).toBeNull()
        })

        it('should render collection of items', () => {
            let jayElement = makeElement({items: [item1, item2, item3]});
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(3);
            expectE(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
            expectE(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2.name);
            expectE(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
            expectE(jayElement.dom.children[0]).toHaveTextContent(item1.name);
            expectE(jayElement.dom.children[1]).toHaveTextContent(item2.name);
            expectE(jayElement.dom.children[2]).toHaveTextContent(item3.name);
        })

        it('should update items of the collection', () => {
            let jayElement = makeElement({items: [item1, item2, item3]});
            jayElement.update({items: [item5, item3, item4, item2, item1]});
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(5);
            expectE(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
            expectE(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2.name);
            expectE(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
            expectE(jayElement.dom.querySelector('#'+item4.id)).toHaveTextContent(item4.name);
            expectE(jayElement.dom.querySelector('#'+item5.id)).toHaveTextContent(item5.name);
            expectE(jayElement.dom.children[0]).toHaveTextContent(item5.name);
            expectE(jayElement.dom.children[1]).toHaveTextContent(item3.name);
            expectE(jayElement.dom.children[2]).toHaveTextContent(item4.name);
            expectE(jayElement.dom.children[3]).toHaveTextContent(item2.name);
            expectE(jayElement.dom.children[4]).toHaveTextContent(item1.name);
        })

        it('should support multiple updates', () => {
            let jayElement = makeElement({items: [item1, item2, item3]});
            jayElement.update({items: [item5, item3, item4, item2, item1]});
            jayElement.update({items: [item3, item4, item2, item1]});
            jayElement.update({items: [item3, item4, item2, item5, item1]});
            jayElement.update({items: [item3, item2, item5, item4, item1]});
            jayElement.update({items: [item3, item2, item5, item4]});
            jayElement.update({items: [item1, item3, item2, item5, item4]});
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(5);
            expectE(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
            expectE(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2.name);
            expectE(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
            expectE(jayElement.dom.querySelector('#'+item4.id)).toHaveTextContent(item4.name);
            expectE(jayElement.dom.querySelector('#'+item5.id)).toHaveTextContent(item5.name);
            expectE(jayElement.dom.children[0]).toHaveTextContent(item1.name);
            expectE(jayElement.dom.children[1]).toHaveTextContent(item3.name);
            expectE(jayElement.dom.children[2]).toHaveTextContent(item2.name);
            expectE(jayElement.dom.children[3]).toHaveTextContent(item5.name);
            expectE(jayElement.dom.children[4]).toHaveTextContent(item4.name);
        })

        it('should update item content', () => {
            let jayElement = makeElement({items: [item1, item2, item3]});
            jayElement.update({items: [item1, item2_1, item3]});
            expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(3);
            expectE(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
            expectE(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2_1.name);
            expectE(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
            expectE(jayElement.dom.children[0]).toHaveTextContent(item1.name);
            expectE(jayElement.dom.children[1]).toHaveTextContent(item2_1.name);
            expectE(jayElement.dom.children[2]).toHaveTextContent(item3.name);
        })
    })

    describe('mutable and immutable collection items', () => {

        function makeElement(data: ViewState): [JayElement<ViewState, any>, Set<string>] {
            let renderedItemNames = new Set<string>();
            let nameGetter = (item) => {
                renderedItemNames.add(item.name);
                return item.name;
            }
            return [ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    forEach(
                        (newViewState) => newViewState.items,
                        (item: Item) => {
                            return e('div', {}, [dt(nameGetter)])
                        },
                        'id'
                    )
                ])
            ), renderedItemNames]
        }

        it('should not re-render the array if it is the same array (assuming immutable array), even if the array content has changed', () => {
            let items = [item1, item2, item3];
            let [jayElement, renderedItemNames] = makeElement({items});
            renderedItemNames.clear();
            items[1] = item2_1;
            jayElement.update({items});

            expect(renderedItemNames).toEqual(new Set([]))
        })

        it('should re-render the array if it is a new array (assuming immutable array)', () => {
            let items = [item1, item2, item3];
            let [jayElement, renderedItemNames] = makeElement({items});
            renderedItemNames.clear();
            items = [item1, item2_1, item3];
            jayElement.update({items});

            expect(renderedItemNames).toEqual(new Set([item2_1.name]))
        })

        it('should re-render mutable array if the array content has changed', () => {
            let items = mutableObject([item1, item2, item3]);
            let [jayElement, renderedItemNames] = makeElement({items});
            renderedItemNames.clear();
            items[1] = item2_1;
            jayElement.update({items});

            expect(renderedItemNames).toEqual(new Set([item2_1.name]))
        })
        it('should re-render new immutable objects in array, not rendering un-replaced objects', () => {
            let [jayElement, renderedItemNames] = makeElement({items: [item1, item2, item3]});
            renderedItemNames.clear();
            jayElement.update({items: [item1, item2_1, item3]});

            expect(renderedItemNames).toEqual(new Set([item2_1.name]))
        })

        it('should re-render updated mutable objects in array, not rendering unchanged mutable objects', () => {
            let items = mutableObject([{...item1}, {...item2}, {...item3}]);
            let [jayElement, renderedItemNames] = makeElement({items});
            renderedItemNames.clear();
            items[1].name = item2_1.name;
            jayElement.update({items});

            expect(renderedItemNames).toEqual(new Set([item2_1.name]))
        })
    })

    describe('references and events', () => {
        interface TodoListRefs {
            done: DynamicReference<Item, HTMLButtonElement>
        }
        interface TodoListElement extends JayElement<ViewState, TodoListRefs> {}
        
        function makeElement(data: ViewState): TodoListElement {
            return ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    forEach(
                        (newViewState) => newViewState.items,
                        (item: Item) => {
                            return e('div', {"class":"item", id: item.id}, [
                                dt(item => item.name),
                                e('button', {ref: 'done'}, ["done"])
                            ])
                        },
                        'id'
                    )
                ])
            ) as TodoListElement
        }

        it('should have dynamic reference to the 3 done buttons', () => {
            let todoListElement = makeElement({items: [item1, item2, item3]});
            let count = 0;
            todoListElement.refs.done.forEach(el => count += 1)
            expect(count).toBe(3);
        })

        it('should register and invoke event on a button', () => {
            let todoListElement = makeElement({items: [item1, item2, item3]});
            let eventCount = 0;
            let savedItem = undefined;
            todoListElement.refs.done.onclick = (ev, item) => {
                eventCount += 1;
                savedItem = item;
            }
            todoListElement.refs.done.filter(item => item === item2).click()
            expect(savedItem).toBe(item2)
            expect(eventCount).toBe(1);
        })

        it('should remove a todo item on click on the done button', () => {
            let todoListElement = makeElement({items: [item1, item2, item3]});
            todoListElement.refs.done.onclick = (ev, item) => {
                todoListElement.update({items: [item1, item3]})
            }
            todoListElement.refs.done.filter(item => item === item2).click()
            let count = 0;
            todoListElement.refs.done.forEach(el => count += 1)
            expect(count).toBe(2);
        })

        it('should add an item to the ref on update', () => {
            let todoListElement = makeElement({items: [item1, item2, item3]});
            todoListElement.update({items: [item1, item3, item2, item4]});
            let count = 0;
            todoListElement.refs.done.forEach(el => count += 1)
            expect(count).toBe(4);
        })
    })

    describe('collection in collection', () => {

        interface CinCCell {
            name: string,
            id: string
        }

        interface CinCLine {
            cells: CinCCell[]
            id: string
        }

        interface CinCViewState {
            lines: Array<CinCLine>;
        }


        function makeElement(data: CinCViewState): JayElement<CinCViewState, any> {
            return ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('table', {}, [
                    forEach((newViewState: CinCViewState) => newViewState.lines,
                        (line: CinCLine) =>
                            de('tr', {}, [
                                forEach((item: CinCLine) => item.cells,
                                    (child: CinCCell) => {
                                        return e('td', {id: child.id}, [dt(child => child.name)])
                                    },
                                    'id'
                                )]),
                        'id'
                    )
                ])
            )
        }

        it('should render basic table', () => {
            let jayElement = makeElement({
                lines: [
                    {id: 'a', cells: [{id: 'a1', name: 'abc'}, {id: 'a2', name: 'def'}]},
                    {id: 'b', cells: [{id: 'b1', name: 'ghi'}, {id: 'b2', name: 'jkl'}]}
                ]});
            let tableCells = jayElement.dom.querySelectorAll('td');
            expect(tableCells).toHaveLength(4);
            expectE(tableCells[0]).toHaveTextContent('abc');
            expectE(tableCells[1]).toHaveTextContent('def');
            expectE(tableCells[2]).toHaveTextContent('ghi');
            expectE(tableCells[3]).toHaveTextContent('jkl');
        })

        it('should update basic table', () => {
            let jayElement = makeElement({
                lines: [
                    {id: 'a', cells: [{id: 'a1', name: 'abc'}, {id: 'a2', name: 'def'}]},
                    {id: 'b', cells: [{id: 'b1', name: 'ghi'}, {id: 'b2', name: 'jkl'}]}
                ]});
            jayElement.update({
                lines: [
                    {id: 'a', cells: [{id: 'a1', name: '123'}, {id: 'a2', name: '456'}]},
                    {id: 'b', cells: [{id: 'b1', name: '789'}, {id: 'b2', name: '101'}]}
                ]})
            let tableCells = jayElement.dom.querySelectorAll('td');
            expect(tableCells).toHaveLength(4);
            expectE(tableCells[0]).toHaveTextContent('123');
            expectE(tableCells[1]).toHaveTextContent('456');
            expectE(tableCells[2]).toHaveTextContent('789');
            expectE(tableCells[3]).toHaveTextContent('101');
        })
    })
});

