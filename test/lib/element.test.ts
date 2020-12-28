import {element as e, JayElement, noopUpdate} from '../../lib/element2';
import {beforeEach, describe, expect, it} from '@jest/globals'

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';

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
});

