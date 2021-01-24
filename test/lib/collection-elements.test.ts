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
        expect(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
        expect(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2.name);
        expect(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
        expect(jayElement.dom.children[0]).toHaveTextContent(item1.name);
        expect(jayElement.dom.children[1]).toHaveTextContent(item2.name);
        expect(jayElement.dom.children[2]).toHaveTextContent(item3.name);
    })

    it('should update items of the collection', () => {
        let jayElement = makeElement({items: [item1, item2, item3]});
        jayElement.update({items: [item5, item3, item4, item2, item1]});
        expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(5);
        expect(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
        expect(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2.name);
        expect(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
        expect(jayElement.dom.querySelector('#'+item4.id)).toHaveTextContent(item4.name);
        expect(jayElement.dom.querySelector('#'+item5.id)).toHaveTextContent(item5.name);
        expect(jayElement.dom.children[0]).toHaveTextContent(item5.name);
        expect(jayElement.dom.children[1]).toHaveTextContent(item3.name);
        expect(jayElement.dom.children[2]).toHaveTextContent(item4.name);
        expect(jayElement.dom.children[3]).toHaveTextContent(item2.name);
        expect(jayElement.dom.children[4]).toHaveTextContent(item1.name);
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
        expect(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
        expect(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2.name);
        expect(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
        expect(jayElement.dom.querySelector('#'+item4.id)).toHaveTextContent(item4.name);
        expect(jayElement.dom.querySelector('#'+item5.id)).toHaveTextContent(item5.name);
        expect(jayElement.dom.children[0]).toHaveTextContent(item1.name);
        expect(jayElement.dom.children[1]).toHaveTextContent(item3.name);
        expect(jayElement.dom.children[2]).toHaveTextContent(item2.name);
        expect(jayElement.dom.children[3]).toHaveTextContent(item5.name);
        expect(jayElement.dom.children[4]).toHaveTextContent(item4.name);
    })

    it('should update item content', () => {
        let jayElement = makeElement({items: [item1, item2, item3]});
        jayElement.update({items: [item1, item2_1, item3]});
        expect(jayElement.dom.querySelectorAll('.item')).toHaveLength(3);
        expect(jayElement.dom.querySelector('#'+item1.id)).toHaveTextContent(item1.name);
        expect(jayElement.dom.querySelector('#'+item2.id)).toHaveTextContent(item2_1.name);
        expect(jayElement.dom.querySelector('#'+item3.id)).toHaveTextContent(item3.name);
        expect(jayElement.dom.children[0]).toHaveTextContent(item1.name);
        expect(jayElement.dom.children[1]).toHaveTextContent(item2_1.name);
        expect(jayElement.dom.children[2]).toHaveTextContent(item3.name);
    })
});

