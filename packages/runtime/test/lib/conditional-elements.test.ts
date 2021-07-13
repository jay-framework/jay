import {
    conditional,
    dynamicElement as de,
    JayElement,
    element as e,
    dynamicText as dt, ConstructContext
} from '../../lib/element';
import "@testing-library/jest-dom/extend-expect";
import {describe, expect, it} from '@jest/globals'
import {expectE} from "./test-utils";

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const VALUE_3 = 'value 3';

describe('conditional-element', () => {

    interface ViewState {
        text1: string,
        text2: string,
        condition: boolean;
    }

    describe('rendering', () => {

        function makeElement(data: ViewState): JayElement<ViewState> {
            return ConstructContext.withRootContext(data, (context: ConstructContext<[ViewState]>) =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    conditional((newViewState) => newViewState.condition,
                        e('div', {style: {cssText: 'color:red'}, "id":"text1"}, [dt(context, data => data.text1)])
                    ),
                    conditional((newViewState) => !newViewState.condition,
                        e('div', {style: {cssText: 'color:green'}, "id":"text2"}, [dt(context, data => data.text2)])
                    )
                ], context))
        }

        it('should render first text if condition is true', () => {
            let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
            expectE(jayElement.dom.querySelector('#text1')).toHaveTextContent(SOME_VALUE);
            expect(jayElement.dom.querySelector('#text2')).toBeNull();
        })

        it('should render first text if condition is true', () => {
            let jayElement = makeElement({text1: SOME_VALUE, condition: false, text2: ANOTHER_VALUE});
            expect(jayElement.dom.querySelector('#text1')).toBeNull();
            expectE(jayElement.dom.querySelector('#text2')).toHaveTextContent(ANOTHER_VALUE);
        })

        it('should update condition to false', () => {
            let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
            jayElement.update({text1: SOME_VALUE, condition: false, text2: ANOTHER_VALUE})
            expect(jayElement.dom.querySelector('#text1')).toBeNull();
            expectE(jayElement.dom.querySelector('#text2')).toHaveTextContent(ANOTHER_VALUE);
        })

        it('should update condition to false and update text', () => {
            let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
            jayElement.update({text1: SOME_VALUE, condition: false, text2: VALUE_3})
            expect(jayElement.dom.querySelector('#text1')).toBeNull();
            expectE(jayElement.dom.querySelector('#text2')).toHaveTextContent(VALUE_3);
        })

    })

    describe('references and events', () => {
        interface ConditionalElement extends JayElement<ViewState> {
            text1: HTMLElement,
            text2: HTMLElement
        }

        function makeElement(data: ViewState): ConditionalElement {

            return ConstructContext.withRootContext(data, (context: ConstructContext<[ViewState]>) =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    conditional((newViewState) => newViewState.condition,
                        e('div', {style: {cssText: 'color:red'}, "ref":"text1"}, [dt(context, data => data.text1)], context)
                    ),
                    conditional((newViewState) => !newViewState.condition,
                        e('div', {style: {cssText: 'color:green'}, "ref":"text2"}, [dt(context, data => data.text2)], context)
                    )
                ], context)) as ConditionalElement
        }

        it('should have references to elements under conditional', () => {
            let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
            expect(jayElement.text1).toBeDefined()
            expect(jayElement.text2).toBeDefined()
        })

        it('should register and invoke events', () => {
            let jayElement = makeElement({text1: SOME_VALUE, condition: true, text2: ANOTHER_VALUE});
            let mockCallback = jest.fn(_ => undefined);
            jayElement.text1.onclick = mockCallback;
            jayElement.text1.click();
            expect(mockCallback.mock.calls.length).toBe(1);
        })

    });
});

