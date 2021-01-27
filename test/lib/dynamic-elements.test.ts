import {
    forEach,
    dynamicElement as de,
    JayElement,
    textElement as text, textElement, conditional
} from '../../lib/element';
import {describe, expect, it} from '@jest/globals'

const item1 = {name: 'name 1', id: 'id-1'};
const item2 = {name: 'name 2', id: 'id-2'};
const item2_1 = {name: 'name 2_1', id: 'id-2'};
const item3 = {name: 'name 3', id: 'id-3'};
const item4 = {name: 'name 4', id: 'id-4'};
const item5 = {name: 'name 5', id: 'id-5'};

describe('dynamic-element with mixed content', () => {

    interface Item {
        name: string
        id: string
    }

    interface ViewState {
        title: string,
        items: Array<Item>;
    }

    function makeElement(data: ViewState): JayElement<ViewState> {
        // noinspection DuplicatedCode
        return de('div', {}, [
            'Some text',
            textElement('h1', {}, data, data => data.title),
            forEach(
                (newViewState) => newViewState.items,
                (item: Item) => text('div', {"className":"item", id: item.id}, item, item => item.name),
                'id'
            ),
            conditional(data => data.items.length === 0,
                "no items found")
        ], data)
    }

    const data1 = {items: [], title: 'the title'};
    const data2 = {items: [
            {name: 'name 1', id: 'a'},
            {name: 'name 2', id: 'b'}
        ], title: 'the title'};
    it('empty collection', () => {
        let jayElement = makeElement(data1);
        expect(jayElement.dom.outerHTML).toEqual('<div>no items found<h1>the title</h1>Some text</div>');
    })

    it('full collection', () => {
        let jayElement = makeElement(data2);
        expect(jayElement.dom.outerHTML).toEqual('<div><div class="item" id="a">name 1</div><div class="item" id="b">name 2</div><h1>the title</h1>Some text</div>');
    })

    it('empty collection', () => {
        let jayElement = makeElement(data1);
        jayElement.update(data2)
        expect(jayElement.dom.outerHTML).toEqual('<div><div class="item" id="a">name 1</div><div class="item" id="b">name 2</div><h1>the title</h1>Some text</div>');
        jayElement.update(data1)
        expect(jayElement.dom.outerHTML).toEqual('<div>no items found<h1>the title</h1>Some text</div>');
    })
});

