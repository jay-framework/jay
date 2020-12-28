import {element as e, JayElement, noopUpdate} from '../../lib/element2';
import {beforeEach, describe, expect, it} from '@jest/globals'

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const VALUE_3 = 'value 3';
const VALUE_4 = 'value 4';
const VALUE_5 = 'value 5';
const VALUE_6 = 'value 6';

describe('element', () => {

    it('should create static dom element with text', () => {
        let jayElement: JayElement<void>;

        jayElement = e('div', {}, [SOME_VALUE]);

        expect(jayElement.dom.textContent).toBe(SOME_VALUE);
        expect(jayElement.update).toBe(noopUpdate);
    })

    it('should create static dom elements tree', () => {
        let jayElement: JayElement<void>;

        jayElement = e('div', {}, [
            e('div', {}, [SOME_VALUE]),
            e('div', {}, [
                e('div', {}, [ANOTHER_VALUE])
            ])
        ]);

        expect(jayElement.dom.childNodes[0].textContent).toBe(SOME_VALUE);
        expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(ANOTHER_VALUE);
        expect(jayElement.update).toBe(noopUpdate);
    })

    describe('single element update', () => {

        interface ViewState {
            text: string
        }

        let jayElement: JayElement<ViewState>;
        let data: ViewState;
        let updateCount;
        beforeEach(() => {
            data = {text: SOME_VALUE};
            updateCount = 0;
            jayElement = e('div', {}, [data.text], data, data.text,
                (elem, newViewState, state) => {
                    if (state !== newViewState.text) {
                        elem.textContent = newViewState.text;
                        updateCount++
                    }
                    return newViewState.text
                });

        });

        it('should create simple element with text', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);
            expect(updateCount).toBe(0);
        })

        it('should update simple element with text', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);

            data.text = ANOTHER_VALUE;
            jayElement.update(data);

            expect(jayElement.dom.textContent).toBe(ANOTHER_VALUE);
            expect(updateCount).toBe(1);
        })

        it('should not update if update called with the same value', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);

            jayElement.update(data);

            expect(jayElement.dom.textContent).toBe(SOME_VALUE);
            expect(updateCount).toBe(0);
        })
    })

    describe('element trees with updates', () => {
        it('should update multiple leafs in a tree', () => {
            interface ViewState {
                text: string,
                text2: string,
                text3: string
            }

            let data: ViewState = {text: SOME_VALUE, text2: ANOTHER_VALUE, text3: VALUE_3};
            let jayElement = e('div', {}, [
                e('div', {}, [SOME_VALUE], data, data.text,
                    (elem, newViewState, state) => {
                        if (state !== newViewState.text) {
                            elem.textContent = newViewState.text;
                        }
                        return newViewState.text}),
                e('div', {}, [
                    e('div', {}, [ANOTHER_VALUE], data, data.text2,
                        (elem, newViewState, state) => {
                            if (state !== newViewState.text2) {
                                elem.textContent = newViewState.text2;
                            }
                            return newViewState.text2}),
                    e('div', {}, [VALUE_3], data, data.text3,
                        (elem, newViewState, state) => {
                            if (state !== newViewState.text3) {
                                elem.textContent = newViewState.text3;
                            }
                            return newViewState.text3})
                ])
            ]);

            expect(jayElement.dom.childNodes[0].textContent).toBe(SOME_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(ANOTHER_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_3);

            data.text = VALUE_4;
            data.text2 = VALUE_5;
            data.text3 = VALUE_6;

            jayElement.update(data);

            expect(jayElement.dom.childNodes[0].textContent).toBe(VALUE_4);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(VALUE_5);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_6);
        })
        
        it('in the case of a signle update in a tree, should propogate the update function to the top', () => {
            interface ViewState {
                text: string,
            }

            let stack;
            let data: ViewState = {text: SOME_VALUE};
            let jayElement = e('div', {}, [
                e('div', {}, [VALUE_3]),
                e('div', {}, [
                    e('div', {}, [SOME_VALUE], data, data.text,
                        (elem, newViewState, state) => {
                            if (state !== newViewState.text) {
                                elem.textContent = newViewState.text;
                                stack = new Error().stack;
                            }
                            return newViewState.text}),
                    e('div', {}, [VALUE_4])
                ])
            ]);


            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(SOME_VALUE);

            data.text = VALUE_6;

            jayElement.update(data);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(VALUE_6);
            expect(stack).not.toContain('__update')
        })
    })
});

