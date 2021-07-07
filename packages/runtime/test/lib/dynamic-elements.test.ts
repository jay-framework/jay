import {
    forEach,
    dynamicElement as de,
    JayElement,
    element as e,
    dynamicText as dt,
    conditional, ConstructContext
} from '../../lib/element';
import {describe, expect, it} from '@jest/globals'

describe('dynamic-element with mixed content', () => {

    interface Item {
        name: string
        id: string
    }

    interface ViewState {
        title: string,
        separator: string,
        items: Array<Item>;
    }

    function makeElement(data: ViewState): JayElement<ViewState> {

        return ConstructContext.withRootContext(data, (context: ConstructContext<[ViewState]>) =>
        // noinspection DuplicatedCode
        de('div', {}, [
            'Some text',
            e('h1', {}, [dt(context, data => data.title)]),
            forEach(
                (newViewState) => newViewState.items,
                (item: Item) => {
                    let childContext = context.child(item);
                    return e('div', {"className":"item", id: item.id}, [dt(childContext, item => item.name)])
                },
                'id'
            ),
            dt(context, data => data.separator),
            conditional(data => data.items.length === 0,
                "no items found")
        ], context))
    }

    const data1 = {items: [], title: 'the title', separator: '---'};
    const data2 = {items: [
            {name: 'name 1', id: 'a'},
            {name: 'name 2', id: 'b'}
        ], title: 'the title', separator: '---'};
    const data3 = {items: [
            {name: 'name 1', id: 'a'},
            {name: 'name 2', id: 'b'}
        ], title: 'the title', separator: '$$$'};
    it('empty collection', () => {
        let jayElement = makeElement(data1);
        expect(jayElement.dom.outerHTML).toEqual('<div>Some text<h1>the title</h1>---no items found</div>');
    })

    it('full collection', () => {
        let jayElement = makeElement(data2);
        expect(jayElement.dom.outerHTML).toEqual('<div>Some text<h1>the title</h1><div class="item" id="a">name 1</div><div class="item" id="b">name 2</div>---</div>');
    })

    it('empty collection', () => {
        let jayElement = makeElement(data1);
        jayElement.update(data2)
        expect(jayElement.dom.outerHTML).toEqual('<div>Some text<h1>the title</h1><div class="item" id="a">name 1</div><div class="item" id="b">name 2</div>---</div>');
        jayElement.update(data1)
        expect(jayElement.dom.outerHTML).toEqual('<div>Some text<h1>the title</h1>---no items found</div>');
        jayElement.update(data3)
        expect(jayElement.dom.outerHTML).toEqual('<div>Some text<h1>the title</h1><div class="item" id="a">name 1</div><div class="item" id="b">name 2</div>$$$</div>');
    })
});

