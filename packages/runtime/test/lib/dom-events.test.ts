import {describe, expect, it, beforeEach} from '@jest/globals'
import {ReferencesManager, ElementReference} from "../../lib/node-reference";
import {element as e} from "../../lib/";
import {JayElement} from "../../lib";
import {HTMLElementProxy} from "../../lib/node-reference-types";

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
            mockCallback = jest.fn(_ => undefined);
            mockCallback2 = jest.fn(_ => undefined);
        })

        describe('register events using addEventListener', () => {
            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
                referenceManager.addHtmlElementRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.addEventListener('click', mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })
        });

        describe('regular events', () => {
            it('should support the regular event registration', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
                referenceManager.addHtmlElementRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it('should support the regular event parameters', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
                referenceManager.addHtmlElementRef(id1, ref);

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
                referenceManager.addHtmlElementRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback2.mock.calls.length).toBe(1);
            })

            it('should support the native event parameters', () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                referenceManager.addHtmlElementRef(id1, ref);

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
        interface ItemViewState {}

        interface RootElementRefs {
            id1: HTMLElementProxy<ItemViewState, HTMLDivElement>
            id2: HTMLElementProxy<ItemViewState, HTMLDivElement>
        }

        let jayElement1, jayElement2, jayElement3,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback, mockCallback2;

        beforeEach(() => {
            jayElement1 = e('div', {}, [SOME_VALUE]);
            jayElement2 = e('div', {}, [SOME_VALUE]);
            jayElement3 = e('div', {}, [SOME_VALUE]);
            jayRootElement = e('div', {}, [jayElement1, jayElement2, jayElement3]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(_ => undefined);
            mockCallback2 = jest.fn(_ => undefined);
        })

        describe('events using addEventListener', () => {
            it("should register events handlers on an element", () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                referenceManager.addHtmlElementRef(id1, ref);
                referenceManager.getElementRefs(id1).addEventListener('click', mockCallback);

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it("should remove events handlers from an element", () => {
                const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                referenceManager.addHtmlElementRef(id1, ref);
                referenceManager.getElementRefs(id1).addEventListener('click', mockCallback);
                referenceManager.getElementRefs(id1).removeEventListener('click', mockCallback);

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            })

            it("should enrich events with the data context", () => {
                const ref = new ElementReference(jayElement1.dom, SOME_VALUE, COORDINATE_11);
                referenceManager.addHtmlElementRef(id1, ref);
                referenceManager.getElementRefs(id1).addEventListener('click', mockCallback);

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][1]).toBe(SOME_VALUE);
            })

            it("should enrich events with the updated data context", () => {
                const ref = new ElementReference(jayElement1.dom, SOME_VALUE, COORDINATE_11);
                referenceManager.addHtmlElementRef(id1, ref);
                referenceManager.getElementRefs(id1).addEventListener('click', mockCallback);
                ref.update(ANOTHER_VALUE)

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][1]).toBe(ANOTHER_VALUE);
            })

            it("should register events on all elements with the same ref id", () => {
                const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
                const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
                referenceManager.addHtmlElementRef(id1, ref1);
                referenceManager.addHtmlElementRef(id1, ref2);
                referenceManager.addHtmlElementRef(id2, ref3);
                referenceManager.getElementRefs(id1).addEventListener('click', mockCallback);

                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            })

            it("should enrich jay element with the refs", () => {
                const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
                const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
                referenceManager.addHtmlElementRef(id1, ref1);
                referenceManager.addHtmlElementRef(id1, ref2);
                referenceManager.addHtmlElementRef(id2, ref3);
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
                const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
                const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
                referenceManager.addHtmlElementRef(id1, ref1);
                referenceManager.addHtmlElementRef(id1, ref2);
                referenceManager.addHtmlElementRef(id2, ref3);
                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback);
                jayElement1.dom.click();
                jayElement2.dom.click();
                jayElement3.dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            })

            it("should support the regular event parameters", () => {
                const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
                const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
                referenceManager.addHtmlElementRef(id1, ref1);
                referenceManager.addHtmlElementRef(id1, ref2);
                referenceManager.addHtmlElementRef(id2, ref3);
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
                const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
                const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
                referenceManager.addHtmlElementRef(id1, ref1);
                referenceManager.addHtmlElementRef(id1, ref2);
                referenceManager.addHtmlElementRef(id2, ref3);
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
                const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE_11);
                const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT, COORDINATE_12);
                const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT, COORDINATE_21);
                referenceManager.addHtmlElementRef(id1, ref1);
                referenceManager.addHtmlElementRef(id1, ref2);
                referenceManager.addHtmlElementRef(id2, ref3);
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
});
