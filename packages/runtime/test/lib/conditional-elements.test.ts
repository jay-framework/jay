import {
    conditional,
    dynamicElement as de,
    element as e,
    dynamicText as dt,
} from '../../lib/element';
import { JSDOM } from 'jsdom';
import { JayElement, HTMLElementProxy } from '../../lib';
import { ConstructContext } from '../../lib/context';
import { elemRef } from '../../lib/node-reference';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const VALUE_3 = 'value 3';

describe('conditional-element', () => {
    interface ViewState {
        text1: string;
        text2: string;
        condition: boolean;
    }

    describe('rendering', () => {
        function makeElement(data: ViewState): JayElement<ViewState, any> {
            return ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    conditional(
                        (newViewState) => newViewState.condition,
                        e('div', { style: { cssText: 'color:red' }, id: 'text1' }, [
                            dt((data) => data.text1),
                        ]),
                    ),
                    conditional(
                        (newViewState) => !newViewState.condition,
                        e('div', { style: { cssText: 'color:green' }, id: 'text2' }, [
                            dt((data) => data.text2),
                        ]),
                    ),
                ]),
            );
        }

        it('should render first text if condition is true', () => {
            let jayElement = makeElement({
                text1: SOME_VALUE,
                condition: true,
                text2: ANOTHER_VALUE,
            });
            expect(jayElement.dom.querySelector('#text1')).toHaveTextContent(SOME_VALUE);
            expect(jayElement.dom.querySelector('#text2')).toBeNull();
        });

        it('should render first text if condition is true', () => {
            let jayElement = makeElement({
                text1: SOME_VALUE,
                condition: false,
                text2: ANOTHER_VALUE,
            });
            expect(jayElement.dom.querySelector('#text1')).toBeNull();
            expect(jayElement.dom.querySelector('#text2')).toHaveTextContent(ANOTHER_VALUE);
        });

        it('should update condition to false', () => {
            let jayElement = makeElement({
                text1: SOME_VALUE,
                condition: true,
                text2: ANOTHER_VALUE,
            });
            jayElement.update({ text1: SOME_VALUE, condition: false, text2: ANOTHER_VALUE });
            expect(jayElement.dom.querySelector('#text1')).toBeNull();
            expect(jayElement.dom.querySelector('#text2')).toHaveTextContent(ANOTHER_VALUE);
        });

        it('should update condition to false and update text', () => {
            let jayElement = makeElement({
                text1: SOME_VALUE,
                condition: true,
                text2: ANOTHER_VALUE,
            });
            jayElement.update({ text1: SOME_VALUE, condition: false, text2: VALUE_3 });
            expect(jayElement.dom.querySelector('#text1')).toBeNull();
            expect(jayElement.dom.querySelector('#text2')).toHaveTextContent(VALUE_3);
        });
    });

    describe('references and events', () => {
        interface ConditionalRefs {
            text1: HTMLElementProxy<ViewState, HTMLElement>;
            text2: HTMLElementProxy<ViewState, HTMLElement>;
        }
        interface ConditionalElement extends JayElement<ViewState, ConditionalRefs> {}

        function makeElement(data: ViewState): ConditionalElement {
            return ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    conditional(
                        (newViewState) => newViewState.condition,
                        e(
                            'div',
                            { style: { cssText: 'color:red' } },
                            [dt((data) => data.text1)],
                            elemRef('text1'),
                        ),
                    ),
                    conditional(
                        (newViewState) => !newViewState.condition,
                        e(
                            'div',
                            { style: { cssText: 'color:green' } },
                            [dt((data) => data.text2)],
                            elemRef('text2'),
                        ),
                    ),
                ]),
            ) as ConditionalElement;
        }

        it('should have references to elements under conditional', () => {
            let jayElement = makeElement({
                text1: SOME_VALUE,
                condition: true,
                text2: ANOTHER_VALUE,
            });
            expect(jayElement.refs.text1).toBeDefined();
            expect(jayElement.refs.text2).toBeDefined();
        });

        it('should register and invoke events', () => {
            let jayElement = makeElement({
                text1: SOME_VALUE,
                condition: true,
                text2: ANOTHER_VALUE,
            });
            let mockCallback = vi.fn();
            jayElement.refs.text1.onclick(mockCallback);
            jayElement.refs.text1.exec$((elem) => elem.click());
            expect(mockCallback.mock.calls.length).toBe(1);
        });
    });

    // those tests do not work, yet they should check that a conditional does not update the dom when not needed
    // when updating the dom, using the call to ensureNode, we loss focus on the input. this test is intended to validate
    // we preserve the focus on the input
    describe.skip('preserve input focus under conditional', () => {
        interface ConditionalViewState {
            condition: boolean;
        }
        interface ConditionalRefs {
            input1: HTMLInputElement;
        }
        interface ConditionalElement extends JayElement<ConditionalViewState, ConditionalRefs> {}

        let blurCount = 0;
        let focusCount = 0;
        function makeElement(data: ConditionalViewState): ConditionalElement {
            const dom = new JSDOM(`<!DOCTYPE html><body></body>`);

            blurCount = 0;
            focusCount = 0;
            let element = ConstructContext.withRootContext(data, () =>
                // noinspection DuplicatedCode
                de('div', {}, [
                    conditional(
                        (newViewState) => newViewState.condition,
                        e('input', { ref: 'input1', id: 'input1' }, []),
                    ),
                ]),
            ) as ConditionalElement;
            dom.window.document.querySelector('body')!.appendChild(element.dom);
            element.refs.input1.onblur = () => {
                console.log('blur');
                blurCount += 1;
            };
            element.refs.input1.onfocus = () => {
                console.log('focus');
                focusCount += 1;
            };

            return element;
        }

        it('should render the input', () => {
            let jayElement = makeElement({ condition: true });
            expect(jayElement.dom.querySelector('#input1')).toBeDefined();
        });

        it('should accept focus and blur', () => {
            let jayElement = makeElement({ condition: true });
            jayElement.refs.input1.focus();
            expect(focusCount).toBe(1);
            expect(blurCount).toBe(0);

            jayElement.refs.input1.blur();
            expect(focusCount).toBe(1);
            expect(blurCount).toBe(1);
        });

        it('conditional update should not trigger blur', () => {
            let jayElement = makeElement({ condition: true });
            jayElement.refs.input1.focus();
            expect(focusCount).toBe(1);
            expect(blurCount).toBe(0);

            jayElement.update({ condition: true });
            expect(focusCount).toBe(1);
            expect(blurCount).toBe(1);
        });
    });
});
