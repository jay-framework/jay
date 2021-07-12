import {
    forEach,
    dynamicElement as de,
    JayElement,
    element as e,
    dynamicText as dt, ConstructContext
} from '../../lib/element';
import {describe, expect, it} from '@jest/globals'
import {expectE} from "./test-utils";
import {DynamicReference} from "../../lib/node-reference";

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

        function makeElement(data: ViewState): JayElement<ViewState> {
            return ConstructContext.withRootContext(data, (context: ConstructContext<[ViewState]>) =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    forEach(
                        (newViewState) => newViewState.items,
                        (item: Item) => {
                            let childContext = context.forItem(item)
                            return e('div', {"className":"item", id: item.id}, [dt(childContext, item => item.name)])
                        },
                        'id'
                    )
                ], context)
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

    describe('references and events', () => {
        interface TodoListElement extends JayElement<ViewState> {
            done: DynamicReference<Item>
        }
        function makeElement(data: ViewState): TodoListElement {
            return ConstructContext.withRootContext(data, (context: ConstructContext<[ViewState]>) =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    forEach(
                        (newViewState) => newViewState.items,
                        (item: Item) => {
                            let childContext = context.forItem(item)
                            return e('div', {"className":"item", id: item.id}, [
                                dt(childContext, item => item.name),
                                e('button', {ref: 'done'}, ["done"], childContext)
                            ])
                        },
                        'id'
                    )
                ], context)
            ) as TodoListElement
        }

        it('should have dynamic reference to the 3 done buttons', () => {
            let todoListElement = makeElement({items: [item1, item2, item3]});
            let count = 0;
            todoListElement.done.forEach(el => count += 1)
            expect(count).toBe(3);
        })

        it('should register event on a button', () => {
            let todoListElement = makeElement({items: [item1, item2, item3]});
            let eventCount = 0;
            let savedItem = undefined;
            todoListElement.done.onclick = (ev, item) => {
                eventCount += 1;
                savedItem = item;
            }
            todoListElement.done.byDataContext(item => item === item2).click()
            expect(savedItem).toBe(item2)
            expect(eventCount).toBe(1);
        })

    })
});

