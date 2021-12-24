import {describe, expect, it, beforeEach} from '@jest/globals'
import {ReferencesManager, ElementReference, newReferenceProxy} from "../../lib/node-reference";
import {element as e} from "../../lib/element";

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const id1 = 'id1';
const id2 = 'id2';

describe('ReferencesManager', () => {
    let jayElement1, jayElement2, jayElement3, jayRootElement,
        referenceManager: ReferencesManager, mockCallback;
    beforeEach(() => {
        jayElement1 = e('div', {}, [SOME_VALUE]);
        jayElement2 = e('div', {}, [SOME_VALUE]);
        jayElement3 = e('div', {}, [SOME_VALUE]);
        jayRootElement = e('div', {}, [jayElement1, jayElement2, jayElement3]);
        referenceManager = new ReferencesManager();
        mockCallback = jest.fn(_ => undefined);
    })

    it("should register events handlers on an element", () => {
        const ref = new ElementReference(jayElement1.dom, "");
        referenceManager.addDynamicRef(id1, ref);
        referenceManager.getDynamic(id1).addEventListener('click', mockCallback);

        jayElement1.dom.click();

        expect(mockCallback.mock.calls.length).toBe(1);
    })

    it("should remove events handlers from an element", () => {
        const ref = new ElementReference(jayElement1.dom, "");
        referenceManager.addDynamicRef(id1, ref);
        referenceManager.getDynamic(id1).addEventListener('click', mockCallback);
        referenceManager.getDynamic(id1).removeEventListener('click', mockCallback);

        jayElement1.dom.click();

        expect(mockCallback.mock.calls.length).toBe(0);
    })

    it("should enrich events with the data context", () => {
        const ref = new ElementReference(jayElement1.dom, SOME_VALUE);
        referenceManager.addDynamicRef(id1, ref);
        referenceManager.getDynamic(id1).addEventListener('click', mockCallback);

        jayElement1.dom.click();

        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
        expect(mockCallback.mock.calls[0][1]).toBe(SOME_VALUE);
    })

    it("should enrich events with the updated data context", () => {
        const ref = new ElementReference(jayElement1.dom, SOME_VALUE);
        referenceManager.addDynamicRef(id1, ref);
        referenceManager.getDynamic(id1).addEventListener('click', mockCallback);
        ref.update(ANOTHER_VALUE)

        jayElement1.dom.click();

        expect(mockCallback.mock.calls.length).toBe(1);
        expect(mockCallback.mock.calls[0][0]).toBeInstanceOf(Event);
        expect(mockCallback.mock.calls[0][1]).toBe(ANOTHER_VALUE);
    })

    it("should register events on all elements with the same ref id", () => {
        const ref1 = new ElementReference(jayElement1.dom, "");
        const ref2 = new ElementReference(jayElement2.dom, "");
        const ref3 = new ElementReference(jayElement3.dom, "");
        referenceManager.addDynamicRef(id1, ref1);
        referenceManager.addDynamicRef(id1, ref2);
        referenceManager.addDynamicRef(id2, ref3);
        referenceManager.getDynamic(id1).addEventListener('click', mockCallback);

        jayElement1.dom.click();
        jayElement2.dom.click();
        jayElement3.dom.click();

        expect(mockCallback.mock.calls.length).toBe(2);
    })

    it("should enrich jay element with the refs", () => {

        const ref1 = new ElementReference(jayElement1.dom, "");
        const ref2 = new ElementReference(jayElement2.dom, "");
        const ref3 = new ElementReference(jayElement3.dom, "");
        referenceManager.addDynamicRef(id1, ref1);
        referenceManager.addDynamicRef(id1, ref2);
        referenceManager.addDynamicRef(id2, ref3);
        jayRootElement = referenceManager.applyToElement(jayRootElement)

        jayRootElement.refs.id1.addEventListener('click', mockCallback);
        jayElement1.dom.click();
        jayElement2.dom.click();
        jayElement3.dom.click();

        expect(mockCallback.mock.calls.length).toBe(2);
    })

    it("should enrich jay element with the refs implementing event registration sugar API", () => {

        const ref1 = new ElementReference(jayElement1.dom, "");
        const ref2 = new ElementReference(jayElement2.dom, "");
        const ref3 = new ElementReference(jayElement3.dom, "");
        referenceManager.addDynamicRef(id1, ref1);
        referenceManager.addDynamicRef(id1, ref2);
        referenceManager.addDynamicRef(id2, ref3);
        jayRootElement = referenceManager.applyToElement(jayRootElement)

        jayRootElement.refs.id1.onclick = mockCallback;
        jayElement1.dom.click();
        jayElement2.dom.click();
        jayElement3.dom.click();

        expect(mockCallback.mock.calls.length).toBe(2);
    })
});
