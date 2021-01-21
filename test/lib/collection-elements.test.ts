import {
    forEach,
    dynamicElement as de,
    element as e,
    JayElement,
    updateTextContent as uTContent
} from '../../lib/element';
import "@testing-library/jest-dom/extend-expect";
import {describe, expect, it} from '@jest/globals'

const item1 = {name: 'name 1', id: 'id-1'};
const item2 = {name: 'name 2', id: 'id-2'};
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

    function makeElement(data: ViewState): JayElement<ViewState> {
        // noinspection DuplicatedCode
        return de('div', {}, [
            forEach(
                (newViewState) => newViewState.items,
                (item: Item) => e('div', {"className":"item", id: item.id}, [item.name], item, item.name, uTContent(vs => vs.name)),
                'id'
            )
        ], data)
    }

    it('should render empty collection', () => {
        let jayElement = makeElement({items: []});
        expect(jayElement.dom.querySelector('.item')).toBeNull()
    })

    it('should render collection of items', () => {
        let jayElement = makeElement({items: [item1, item2, item3]});
        expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(3);
        expect(jayElement.dom.querySelector('#id-1')).toHaveTextContent('name 1');
        expect(jayElement.dom.querySelector('#id-2')).toHaveTextContent('name 2');
        expect(jayElement.dom.querySelector('#id-3')).toHaveTextContent('name 3');
        expect(jayElement.dom.children[0]).toHaveTextContent('name 1');
        expect(jayElement.dom.children[1]).toHaveTextContent('name 2');
        expect(jayElement.dom.children[2]).toHaveTextContent('name 3');
    })

    it('should update collection of items', () => {
        let jayElement = makeElement({items: [item1, item2, item3]});
        jayElement.update({items: [item5, item3, item4, item2, item1]});
        expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(5);
        expect(jayElement.dom.querySelector('#id-1')).toHaveTextContent('name 1');
        expect(jayElement.dom.querySelector('#id-2')).toHaveTextContent('name 2');
        expect(jayElement.dom.querySelector('#id-3')).toHaveTextContent('name 3');
        expect(jayElement.dom.querySelector('#id-4')).toHaveTextContent('name 4');
        expect(jayElement.dom.querySelector('#id-5')).toHaveTextContent('name 5');
        expect(jayElement.dom.children[0]).toHaveTextContent('name 5');
        expect(jayElement.dom.children[1]).toHaveTextContent('name 3');
        expect(jayElement.dom.children[2]).toHaveTextContent('name 4');
        expect(jayElement.dom.children[3]).toHaveTextContent('name 2');
        expect(jayElement.dom.children[4]).toHaveTextContent('name 1');
    })
});

