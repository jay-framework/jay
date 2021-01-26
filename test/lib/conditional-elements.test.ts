import {
    conditional,
    dynamicElement as de,
    JayElement,
    textElement as text
} from '../../lib/element';
import "@testing-library/jest-dom/extend-expect";
import {describe, expect, it} from '@jest/globals'

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const VALUE_3 = 'value 3';

describe('conditional-element', () => {

    interface ViewState {
        text1: string,
        text2: string,
        condition: boolean;
    }

    function makeElement(data: ViewState): JayElement<ViewState> {
        // noinspection DuplicatedCode
        return de('div', {}, [
            conditional((newViewState) => newViewState.condition,
                text('div', {style: {cssText: 'color:red'}, "id":"text1"}, data, data => data.text1)
            ),
            conditional((newViewState) => !newViewState.condition,
                text('div', {style: {cssText: 'color:green'}, "id":"text2"}, data, data => data.text2)
            )
        ], data)
    }

    it('should render first text if condition is true', () => {
        let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
        expect(jayElement.dom.querySelector('#text1')).toHaveTextContent(SOME_VALUE);
        expect(jayElement.dom.querySelector('#text2')).toBeNull();
    })

    it('should render first text if condition is true', () => {
        let jayElement = makeElement({text1: SOME_VALUE, condition: false, text2: ANOTHER_VALUE});
        expect(jayElement.dom.querySelector('#text1')).toBeNull();
        expect(jayElement.dom.querySelector('#text2')).toHaveTextContent(ANOTHER_VALUE);
    })

    it('should update condition to false', () => {
        let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
        jayElement.update({text1: SOME_VALUE, condition: false, text2: ANOTHER_VALUE})
        expect(jayElement.dom.querySelector('#text1')).toBeNull();
        expect(jayElement.dom.querySelector('#text2')).toHaveTextContent(ANOTHER_VALUE);
    })

    it('should update condition to false and update text', () => {
        let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
        jayElement.update({text1: SOME_VALUE, condition: false, text2: VALUE_3})
        expect(jayElement.dom.querySelector('#text1')).toBeNull();
        expect(jayElement.dom.querySelector('#text2')).toHaveTextContent(VALUE_3);
    })
});

