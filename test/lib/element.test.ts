import {element as e, JayElement, noopUpdate} from '../../lib/element2';
import {beforeEach, describe, expect, it} from '@jest/globals'


describe('element', () => {

    describe('single static element', () => {
        let jayElement: JayElement<void>;
        const SOME_VALUE = 'some text in the element';

        beforeEach(() => {
            jayElement = e('div', {}, [SOME_VALUE]);
        });

        it('should create dom element with text', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);
            expect(jayElement.update).toBe(noopUpdate);
        })
    })

    describe('single element update', () => {

        interface ViewState {
            text: string
        }

        const SOME_VALUE = 'some value';
        const ANOTHER_VALUE = 'another value';
        let jayElement: JayElement<ViewState>;
        let data: ViewState;
        let updateCount;
        beforeEach(() => {
            data = {text: SOME_VALUE};
            updateCount = 0;
            jayElement = e('div', {}, [data.text], data, data.text,
                (elem, newViewState, oldViewState, state) => {
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

            data.text = 'another value';
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
});

