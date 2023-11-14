import {
    element as e,
    dynamicAttribute as da,
    booleanAttribute as ba,
    dynamicText as dt,
    dynamicProperty as dp,
} from '../../lib/element';
import { BaseJayElement, JayElement, noopUpdate } from '../../lib';
import { ConstructContext } from '../../lib';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const VALUE_3 = 'value 3';
const VALUE_4 = 'value 4';
const VALUE_5 = 'value 5';
const VALUE_6 = 'value 6';

describe('element', () => {
    it('should create static dom element with text', () => {
        let jayElement: BaseJayElement<void>;

        jayElement = e('div', {}, [SOME_VALUE]);

        expect(jayElement.dom.textContent).toBe(SOME_VALUE);
        expect(jayElement.update).toBe(noopUpdate);
    });

    it('should create static dom elements tree', () => {
        let jayElement: BaseJayElement<void>;

        jayElement = e('div', {}, [
            e('div', {}, [SOME_VALUE]),
            e('div', {}, [e('div', {}, [ANOTHER_VALUE])]),
        ]);

        expect(jayElement.dom.childNodes[0].textContent).toBe(SOME_VALUE);
        expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(ANOTHER_VALUE);
        expect(jayElement.update).toBe(noopUpdate);
    });

    describe('single element update', () => {
        interface ViewState {
            text: string;
        }

        let jayElement: JayElement<ViewState, void>;
        let data: ViewState;
        let updateCount;
        beforeEach(() => {
            data = { text: SOME_VALUE };
            updateCount = 0;
            jayElement = ConstructContext.withRootContext(data, () =>
                e('div', {
                    textContent: dp((vs) => {
                        updateCount++;
                        return vs.text;
                    }),
                }),
            );
        });

        it('should create simple element with text', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);
            expect(updateCount).toBe(1);
        });

        it('should update simple element with text', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);

            data = { text: ANOTHER_VALUE };
            jayElement.update(data);

            expect(jayElement.dom.textContent).toBe(ANOTHER_VALUE);
            expect(updateCount).toBe(2);
        });

        it('should not update if update called with the same value', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);

            data = { text: SOME_VALUE };
            jayElement.update(data);

            expect(jayElement.dom.textContent).toBe(SOME_VALUE);
            expect(updateCount).toBe(2);
        });
    });

    describe('dynamic attribute', () => {
        interface ViewState {
            title: string;
        }
        let jayElement: JayElement<ViewState, void>;
        let data: ViewState;
        beforeEach(() => {
            data = { title: 'initial value' };
            jayElement = ConstructContext.withRootContext(data, () =>
                e(
                    'input',
                    {
                        value: da((vs) => vs.title),
                    },
                    ['some text'],
                ),
            );
        });

        it('should create element initial attribute value', () => {
            expect((jayElement.dom as HTMLInputElement).value).toBe('initial value');
        });

        it('should update element two class two', () => {
            jayElement.update({ title: 'another value' });
            expect((jayElement.dom as HTMLInputElement).value).toBe('another value');
        });
    });

    describe('boolean attribute', () => {
        interface ViewState {
            disabled: boolean;
        }
        let jayElement: JayElement<ViewState, void>;
        let data: ViewState;
        beforeEach(() => {
            data = { disabled: true };
            jayElement = ConstructContext.withRootContext(data, () =>
                e(
                    'input',
                    {
                        disabled: ba((vs) => vs.disabled),
                    },
                    ['some text'],
                ),
            );
        });

        it('should create element initial attribute value', () => {
            expect((jayElement.dom as HTMLInputElement).disabled).toBe(true);
        });

        it('should update element two class two', () => {
            jayElement.update({ disabled: false });
            expect((jayElement.dom as HTMLInputElement).disabled).toBe(false);
        });
    });

    describe('dynamic classes', () => {
        interface ViewState {
            isOne: boolean;
            isTwo: boolean;
        }
        let jayElement: JayElement<ViewState, void>;
        let data: ViewState;
        beforeEach(() => {
            data = { isOne: true, isTwo: false };
            jayElement = ConstructContext.withRootContext(data, () =>
                e(
                    'div',
                    {
                        class: da((vs) => `${vs.isOne ? 'one' : ''} ${vs.isTwo ? 'two' : ''}`),
                    },
                    ['some text'],
                ),
            );
        });

        it('should create element with class one', () => {
            expect(jayElement.dom.className).toBe('one ');
        });

        it('should update element two class two', () => {
            jayElement.update({ isOne: false, isTwo: true });
            expect(jayElement.dom.className).toBe(' two');
        });

        it('should update element to have both classes', () => {
            jayElement.update({ isOne: true, isTwo: true });
            expect(jayElement.dom.className).toBe('one two');
        });

        it('should update element to have no classes', () => {
            jayElement.update({ isOne: false, isTwo: false });
            expect(jayElement.dom.className).toBe(' ');
        });
    });

    describe('dynamic styles', () => {
        interface ViewState {
            text: string;
            width: string;
            color: string;
        }

        let jayElement: JayElement<ViewState, void>;
        let data: ViewState;
        beforeEach(() => {
            data = { text: SOME_VALUE, width: '100px', color: 'red' };
            jayElement = ConstructContext.withRootContext(data, () =>
                e('div', {
                    textContent: dp((vs) => vs.text),
                    style: {
                        color: dp((vs) => vs.color),
                        width: dp((vs) => vs.width),
                    },
                }),
            );
        });

        it('should create element with styles', () => {
            expect(jayElement.dom.textContent).toBe(SOME_VALUE);
            expect(jayElement.dom.style.color).toBe('red');
            expect(jayElement.dom.style.width).toBe('100px');
        });

        it('should update element styles', () => {
            data = { text: ANOTHER_VALUE, width: '120px', color: 'green' };
            jayElement.update(data);

            expect(jayElement.dom.textContent).toBe(ANOTHER_VALUE);
            expect(jayElement.dom.style.color).toBe('green');
            expect(jayElement.dom.style.width).toBe('120px');
        });
    });

    describe('element trees with updates', () => {
        it('should update multiple leaves in a tree', () => {
            interface ViewState {
                text: string;
                text2: string;
                text3: string;
            }

            let data: ViewState = { text: SOME_VALUE, text2: ANOTHER_VALUE, text3: VALUE_3 };
            let jayElement = ConstructContext.withRootContext(data, () =>
                e('div', {}, [
                    e('div', { textContent: dp((vs) => vs.text) }),
                    e('div', {}, [
                        e('div', { textContent: dp((vs) => vs.text2) }),
                        e('div', { textContent: dp((vs) => vs.text3) }),
                    ]),
                ]),
            );

            expect(jayElement.dom.childNodes[0].textContent).toBe(SOME_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(ANOTHER_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_3);

            data = { text: VALUE_4, text2: VALUE_5, text3: VALUE_6 };

            jayElement.update(data);

            expect(jayElement.dom.childNodes[0].textContent).toBe(VALUE_4);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(VALUE_5);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_6);
        });

        it('in the case of a single update in a tree, should propagate the update function to the top', () => {
            interface ViewState {
                text: string;
            }

            let stack = '__update';
            let data: ViewState = { text: SOME_VALUE };
            let jayElement = ConstructContext.withRootContext(data, () =>
                e('div', {}, [
                    e('div', {}, [VALUE_3]),
                    e('div', {}, [
                        e('div', {
                            textContent: dp((vs) => {
                                stack = new Error().stack!;
                                return vs.text;
                            }),
                        }),
                        e('div', {}, [VALUE_4]),
                    ]),
                ]),
            );

            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(SOME_VALUE);

            data = { ...data, text: VALUE_6 };

            jayElement.update(data);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(VALUE_6);
            expect(stack).not.toContain('__update');
        });

        it('in the case multiple updates in a static sub-tree, should merge all static branches in one update branch', () => {
            interface ViewState {
                text: string;
                text2: string;
                text3: string;
            }

            let stack = '__update';
            let data: ViewState = { text: SOME_VALUE, text2: ANOTHER_VALUE, text3: VALUE_3 };
            let jayElement = ConstructContext.withRootContext(data, () =>
                e('div', {}, [
                    e('div', {}, [dt((vs) => vs.text2)]),
                    e('div', {}, [
                        e('div', {
                            textContent: dp((vs) => {
                                stack = new Error().stack!;
                                return vs.text;
                            }),
                        }),
                        e('div', {}, [dt((vs) => vs.text3)]),
                    ]),
                ]),
            );

            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(SOME_VALUE);
            expect(jayElement.dom.childNodes[0].textContent).toBe(ANOTHER_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_3);

            data = { text: VALUE_4, text2: VALUE_5, text3: VALUE_6 };

            jayElement.update(data);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(VALUE_4);
            expect(jayElement.dom.childNodes[0].textContent).toBe(VALUE_5);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_6);

            // check that __update appears only once in the stack trace of an update function
            const count_update_regex = /updateFunc/gm;
            let countUpdates = 0;
            let m;
            do {
                m = count_update_regex.exec(stack);
                if (m != null) countUpdates += 1;
            } while (m);
            expect(countUpdates).toBe(1);
        });
    });

    describe('immutable ViewState', () => {
        interface ViewState {
            text: string;
            text2: string;
            text3: string;
        }

        function makeElement(data: ViewState) {
            return ConstructContext.withRootContext(data, () =>
                e('div', {}, [
                    e('div', { textContent: dp((vs) => vs.text) }),
                    e('div', {}, [
                        e('div', { textContent: dp((vs) => vs.text2) }),
                        e('div', { textContent: dp((vs) => vs.text3) }),
                    ]),
                ]),
            );
        }

        it('should update in case of new object', () => {
            let data: ViewState = { text: SOME_VALUE, text2: ANOTHER_VALUE, text3: VALUE_3 };
            let jayElement = makeElement(data);

            data = { text: VALUE_4, text2: VALUE_5, text3: VALUE_6 };

            jayElement.update(data);

            expect(jayElement.dom.childNodes[0].textContent).toBe(VALUE_4);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(VALUE_5);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_6);
        });

        it('should not update in case of same object, if the object is not marked as mutable', () => {
            let data: ViewState = { text: SOME_VALUE, text2: ANOTHER_VALUE, text3: VALUE_3 };
            let jayElement = makeElement(data);

            data.text = VALUE_4;
            data.text2 = VALUE_5;
            data.text3 = VALUE_6;

            jayElement.update(data);

            expect(jayElement.dom.childNodes[0].textContent).toBe(SOME_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[0].textContent).toBe(ANOTHER_VALUE);
            expect(jayElement.dom.childNodes[1].childNodes[1].textContent).toBe(VALUE_3);
        });
    });
});
