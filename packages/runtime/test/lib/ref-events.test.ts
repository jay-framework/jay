import {beforeEach, describe, expect, it} from '@jest/globals'
import {ElementReference, ReferencesManager, RefType} from "../../lib/node-reference";
import {childComp, ConstructContext, element as e} from "../../lib/";
import {JayElement} from "../../lib";
import {HTMLElementProxy} from "../../lib/node-reference-types";
import {Item, ItemComponent, ItemProps} from "./comps/item";
import '../../lib/element-test-types';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const id1 = 'id1';
const id2 = 'id2';
const DATA_CONTEXT = 'DataContext'
const COORDINATE = id1
const COORDINATE_11 = `${id1}.1`
const COORDINATE_12 = `${id1}.2`
const COORDINATE_21 = `${id2}.1`

describe('ReferencesManager events', () => {

    describe('single referenced element', () => {

        interface RootElementViewState {}
        interface RootElementRefs {
            id1: HTMLElementProxy<RootElementViewState, HTMLDivElement>
            id2: HTMLElementProxy<RootElementViewState, HTMLDivElement>
        }

        let jayElement1, jayElement2,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback, mockCallback2;
        beforeEach(() => {
            jayElement1 = e('div', {}, [SOME_VALUE]);
            jayElement2 = e('div', {}, [SOME_VALUE]);
            jayRootElement = e('div', {}, [jayElement1, jayElement2]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);
        })

        describe('register events using addEventListener', () => {
            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.addEventListener('click', mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })
        });

        describe('regular events', () => {
            it('should support the regular event registration', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it('should support the regular event parameters', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0]).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][1]).toBe(COORDINATE);
            })
        })

        describe('native $events', () => {
            it('should support the native event registration', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback2.mock.calls.length).toBe(1);
            })

            it('should support the native event parameters', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                mockCallback.mockReturnValueOnce(SOME_VALUE)
                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][2]).toBe(COORDINATE_11);

                expect(mockCallback2.mock.calls[0][0]).toBe(SOME_VALUE);
                expect(mockCallback2.mock.calls[0][1]).toBe(DATA_CONTEXT);
                expect(mockCallback2.mock.calls[0][2]).toBe(COORDINATE_11);
            })
        })

    })

    describe('dynamic list of referenced elements', () => {

        interface RootElementViewState {}
        interface RootElementRefs {
            id1: HTMLElementProxy<RootElementViewState, HTMLDivElement>
            id2: HTMLElementProxy<RootElementViewState, HTMLDivElement>
        }

        let jayElement1, jayElement2, jayElement3, ref1, ref2, ref3,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback, mockCallback2;

        beforeEach(() => {
            jayElement1 = e('div', {}, [SOME_VALUE]);
            jayElement2 = e('div', {}, [SOME_VALUE]);
            jayElement3 = e('div', {}, [SOME_VALUE]);
            jayRootElement = e('div', {}, [jayElement1, jayElement2, jayElement3]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);

            ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
            ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
            ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
            referenceManager.addDynamicRef(id1, ref1, RefType.HTMLElement);
            referenceManager.addDynamicRef(id1, ref2, RefType.HTMLElement);
            referenceManager.addDynamicRef(id2, ref3, RefType.HTMLElement);

        })

        describe('events using addEventListener', () => {
            it("should register events handlers on an element", () => {
                referenceManager.getRefCollection(id1).addEventListener('click', mockCallback);

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it("should remove events handlers from an element", () => {
                referenceManager.getRefCollection(id1).addEventListener('click', mockCallback);
                referenceManager.getRefCollection(id1).removeEventListener('click', mockCallback);

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            })

            it("should enrich events with the data context", () => {
                referenceManager.getRefCollection(id1).addEventListener('click', mockCallback);

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT);
            })

            it("should enrich events with the updated data context", () => {
                referenceManager.getRefCollection(id1).addEventListener('click', mockCallback);
                ref1.update(ANOTHER_VALUE)

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][1]).toBe(ANOTHER_VALUE);
            })

            it("should register events on all elements with the same ref id", () => {
                referenceManager.getRefCollection(id1).addEventListener('click', mockCallback);

                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            })

            it("should enrich jay element with the refs", () => {
                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.addEventListener('click', mockCallback);
                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            })
        });

        describe('regular events', () => {
            it("should support the regular event registration", () => {
                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback);
                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            })

            it("should support the regular event parameters", () => {
                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback);
                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls[0][0]).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][1]).toBe(COORDINATE_11);
                expect(mockCallback.mock.calls[1][0]).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[1][1]).toBe(COORDINATE_12);
            })
        })

        describe('native events', () => {
            it("should support the regular event registration", () => {
                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
                expect(mockCallback2.mock.calls.length).toBe(2);
            })

            it("should support the regular event parameters", () => {
                jayRootElement = referenceManager.applyToElement(jayRootElement)

                mockCallback.mockReturnValueOnce(SOME_VALUE).mockReturnValueOnce(ANOTHER_VALUE)
                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][2]).toBe(COORDINATE_11);

                expect(mockCallback2.mock.calls[0][0]).toBe(SOME_VALUE);
                expect(mockCallback2.mock.calls[0][1]).toBe(DATA_CONTEXT);
                expect(mockCallback2.mock.calls[0][2]).toBe(COORDINATE_11);

                expect(mockCallback.mock.calls[1][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[1][1]).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[1][2]).toBe(COORDINATE_12);

                expect(mockCallback2.mock.calls[1][0]).toBe(ANOTHER_VALUE);
                expect(mockCallback2.mock.calls[1][1]).toBe(DATA_CONTEXT);
                expect(mockCallback2.mock.calls[1][2]).toBe(COORDINATE_12);
            })
        })
    })

    describe('single referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ItemComponent
        }

        const ITEM_PROPS = {text: 'hello', dataId: 'A'};
        let jayComponent: ItemComponent,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback;
        beforeEach(() => {

            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
              e('div', {}, [
                  childComp((props, options) => jayComponent = Item(props as ItemProps, options),
                    vs => ITEM_PROPS, 'static')])) as JayElement<RootElementViewState, RootElementRefs>;

            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
            referenceManager.addComponnetRef(id1, jayComponent);

            jayRootElement = referenceManager.applyToElement(jayRootElement)
        })

        it('should enrich root element with the ref and allow registering events using addEventListener', () => {
            jayRootElement.refs.id1.addEventListener('remove', mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(1);
        })

        it('should enrich root element with the ref and allow registering events using onremove', () => {
            jayRootElement.refs.id1.onremove(mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(1);
        })

        it('event parameters', () => {
            jayRootElement.refs.id1.onremove(mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0]).toBe('item hello - false is removed');
            expect(mockCallback.mock.calls[0][1]).toEqual(ITEM_PROPS);
            expect(mockCallback.mock.calls[0][2]).toBe('static');
        })

        it('should remove event using removeEventListener', () => {
            jayRootElement.refs.id1.addEventListener('remove', mockCallback);
            jayRootElement.refs.id1.removeEventListener('remove', mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(0);
        })

    })
});
