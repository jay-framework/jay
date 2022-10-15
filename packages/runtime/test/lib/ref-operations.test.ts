import {describe, expect, it, beforeEach} from '@jest/globals'
import {ReferencesManager, ElementReference} from "../../lib/node-reference";
import {childComp, ConstructContext, element as e} from "../../lib/";
import {JayElement} from "../../lib";
import {ComponentProxy, HTMLElementProxy} from "../../lib/node-reference-types";
import {Item, ItemComponent, ItemData} from "./comps/item";
import '../../lib/element-test-types';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const id1 = 'id1';
const id2 = 'id2';
const DATA_CONTEXT = 'DataContext'
const DATA_CONTEXT_1 = 'DataContext 1'
const DATA_CONTEXT_2 = 'DataContext 2'
const DATA_CONTEXT_3 = 'DataContext 3'
const COORDINATE = id1
const COORDINATE_11 = `${id1}.1`
const COORDINATE_12 = `${id1}.2`
const COORDINATE_21 = `${id2}.1`

describe('ReferencesManager operations', () => {

    describe('single referenced element', () => {

        interface RootElementViewState {}
        interface RootElementRefs {
            id1: HTMLElementProxy<RootElementViewState, HTMLDivElement>
        }

        let jayElement1,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback, mockCallback2;
        beforeEach(() => {
            jayElement1 = e('div', {}, [SOME_VALUE]);
            jayRootElement = e('div', {}, [jayElement1]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(_ => undefined);
            mockCallback2 = jest.fn(_ => undefined);
            const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
            referenceManager.addHtmlElementRef(id1, ref);
            jayRootElement = referenceManager.applyToElement(jayRootElement)
        })

        it('forEach should run for each referenced element', () => {
            jayRootElement.refs.id1.forEach(mockCallback)
            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0]).toBe(jayElement1.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT);
            expect(mockCallback.mock.calls[0][2]).toBe(id1);
        })

        it('find should find elements', () => {
            jayRootElement = referenceManager.applyToElement(jayRootElement)

            mockCallback.mockReturnValueOnce(true)
            let elementProxy = jayRootElement.refs.id1.find(mockCallback)
            expect(mockCallback.mock.calls.length).toBe(1);

            elementProxy.forEach(mockCallback2);
            expect(mockCallback2.mock.calls.length).toBe(1);
            expect(mockCallback2.mock.calls[0][0]).toBe(jayElement1.dom);
        })

        it('$exec should run code with the native HTMLElement', () => {
            mockCallback.mockReturnValueOnce(18)
            let result = jayRootElement.refs.id1.$exec(mockCallback)

            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0]).toBe(jayElement1.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT);
            expect(result).toEqual([18]);
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
            jayElement2 = e('div', {}, [ANOTHER_VALUE]);
            jayElement3 = e('div', {}, [SOME_VALUE]);
            jayRootElement = e('div', {}, [jayElement1, jayElement2, jayElement3]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(_ => undefined);
            mockCallback2 = jest.fn(_ => undefined);
            const ref1 = new ElementReference(jayElement1.dom, DATA_CONTEXT_1, COORDINATE_11);
            const ref2 = new ElementReference(jayElement2.dom, DATA_CONTEXT_2, COORDINATE_12);
            const ref3 = new ElementReference(jayElement3.dom, DATA_CONTEXT_3, COORDINATE_21);
            referenceManager.addHtmlElementRef(id1, ref1);
            referenceManager.addHtmlElementRef(id1, ref2);
            referenceManager.addHtmlElementRef(id2, ref3);
            jayRootElement = referenceManager.applyToElement(jayRootElement)
        })

        it("forEach should run for each referenced element", () => {
            jayRootElement.refs.id1.forEach(mockCallback)

            expect(mockCallback.mock.calls.length).toBe(2);
            expect(mockCallback.mock.calls[0][0]).toBe(jayElement1.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT_1);
            expect(mockCallback.mock.calls[0][2]).toBe(COORDINATE_11);
            expect(mockCallback.mock.calls[1][0]).toBe(jayElement2.dom);
            expect(mockCallback.mock.calls[1][1]).toBe(DATA_CONTEXT_2);
            expect(mockCallback.mock.calls[1][2]).toBe(COORDINATE_12);
        })

        it("find should find elements", () => {
            let element2 = jayRootElement.refs.id1.find(vs => vs === DATA_CONTEXT_2)

            element2.forEach(mockCallback)
            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0]).toBe(jayElement2.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT_2);
            expect(mockCallback.mock.calls[0][2]).toBe(COORDINATE_12);
        })

        it("$exec should run for all elements", () => {
            let execResult = jayRootElement.refs.id1.$exec((elem, vs) => elem.textContent)

            expect(execResult).toEqual([SOME_VALUE, ANOTHER_VALUE]);
        })
    })

    describe('single referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ComponentProxy<RootElementViewState, ItemComponent>
        }

        let jayComponent: ItemComponent,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback;
        beforeEach(() => {
            jayComponent = Item({text: 'hello', dataId: 'A'})
            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
              e('div', {}, [
                  childComp((props: ItemData) => jayComponent = Item(props),
                    vs => ({text: 'hello', dataId: 'AAA'}), 'static')])) as JayElement<RootElementViewState, RootElementRefs>;

            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(_ => undefined);
        })

        it('should enrich root element with the ref and allow registering events using addEventListener', () => {
            const ref = new ElementReference(jayComponent, DATA_CONTEXT, COORDINATE);
            referenceManager.addHtmlElementRef(id1, ref);

            jayRootElement = referenceManager.applyToElement(jayRootElement)

            jayRootElement.refs.id1.addEventListener('remove', mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(1);
        })

        it('should enrich root element with the ref and allow registering events using onremove', () => {
            const ref = new ElementReference(jayComponent, DATA_CONTEXT, COORDINATE);
            referenceManager.addHtmlElementRef(id1, ref);

            jayRootElement = referenceManager.applyToElement(jayRootElement)

            jayRootElement.refs.id1.onremove(mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(1);
        })

        it('should remove event using removeEventListener', () => {
            const ref = new ElementReference(jayComponent, DATA_CONTEXT, COORDINATE);
            referenceManager.addHtmlElementRef(id1, ref);

            jayRootElement = referenceManager.applyToElement(jayRootElement)

            jayRootElement.refs.id1.addEventListener('remove', mockCallback);
            jayRootElement.refs.id1.removeEventListener('remove', mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(mockCallback.mock.calls.length).toBe(0);
        })

    })
});
