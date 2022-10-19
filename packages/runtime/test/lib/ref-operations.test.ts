import {beforeEach, describe, expect, it} from '@jest/globals'
import {ElementReference, ReferencesManager, RefType} from "../../lib/node-reference";
import {childComp, ConstructContext, element as e} from "../../lib/";
import {JayElement} from "../../lib";
import {ComponentCollectionProxy, HTMLElementCollectionProxy, HTMLElementProxy} from "../../lib/node-reference-types";
import {Item, ItemComponent, ItemProps, ItemVS} from "./comps/item";
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
const COORDINATE_22 = `${id2}.2`
const COORDINATE_23 = `${id2}.3`
const COORDINATE_24 = `${id2}.4`

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
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);
            const ref = new ElementReference(jayElement1.dom, DATA_CONTEXT, COORDINATE);
            referenceManager.addStaticRef(id1, ref);
            jayRootElement = referenceManager.applyToElement(jayRootElement)
        })

        it('$exec should run for with the native html element', () => {
            jayRootElement.refs.id1.$exec(mockCallback)
            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0]).toBe(jayElement1.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT);
        })
    })

    describe('dynamic list of referenced elements', () => {

        interface RootElementViewState {}
        interface ItemViewState {}

        interface RootElementRefs {
            id1: HTMLElementCollectionProxy<ItemViewState, HTMLDivElement>
            id2: HTMLElementCollectionProxy<ItemViewState, HTMLDivElement>
        }

        let je1, je2, je3, je4,je5,je6,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback, mockCallback2;

        beforeEach(() => {
            je1 = e('div', {}, [SOME_VALUE]);
            je2 = e('div', {}, [ANOTHER_VALUE]);
            je3 = e('div', {}, [DATA_CONTEXT_3]);
            je4 = e('div', {}, [DATA_CONTEXT_1]);
            je5 = e('div', {}, [DATA_CONTEXT_2]);
            je6 = e('div', {}, [DATA_CONTEXT_3]);
            jayRootElement = e('div', {}, [je1, je2, je3]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);
            const ref1 = new ElementReference(je1.dom, DATA_CONTEXT_1, COORDINATE_11);
            const ref2 = new ElementReference(je2.dom, DATA_CONTEXT_2, COORDINATE_12);
            const ref_ids = [new ElementReference(je3.dom, DATA_CONTEXT_3, COORDINATE_21),
                new ElementReference(je4.dom, DATA_CONTEXT_1, COORDINATE_22),
                new ElementReference(je5.dom, DATA_CONTEXT_2, COORDINATE_23),
                new ElementReference(je6.dom, DATA_CONTEXT_3, COORDINATE_24)];
            referenceManager.addDynamicRef(id1, ref1, RefType.HTMLElement);
            referenceManager.addDynamicRef(id1, ref2, RefType.HTMLElement);
            ref_ids.forEach(_ => referenceManager.addDynamicRef(id2, _, RefType.HTMLElement));
            jayRootElement = referenceManager.applyToElement(jayRootElement)
        })

        it("$exec should run for each referenced element", () => {
            mockCallback.mockReturnValueOnce(SOME_VALUE).mockReturnValueOnce(ANOTHER_VALUE)
            let execResult = jayRootElement.refs.id1.$exec(mockCallback)

            expect(execResult.length).toBe(2);
            expect(execResult).toEqual([SOME_VALUE, ANOTHER_VALUE]);
            expect(mockCallback.mock.calls.length).toBe(2);
            expect(mockCallback.mock.calls[0][0]).toBe(je1.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT_1);
            expect(mockCallback.mock.calls[1][0]).toBe(je2.dom);
            expect(mockCallback.mock.calls[1][1]).toBe(DATA_CONTEXT_2);
        })

        it("find should find the first element meeting a criteria", () => {
            let element2 = jayRootElement.refs.id1.find(vs => vs === DATA_CONTEXT_2)

            element2.$exec(mockCallback)
            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls[0][0]).toBe(je2.dom);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT_2);
        })
    })

    describe('single referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ItemComponent
        }

        let jayComponent: ItemComponent,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback;
        beforeEach(() => {
            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
              e('div', {}, [
                  childComp((props, options) => jayComponent = Item(props, options),
                    vs => ({text: 'hello', dataId: 'AAA'}), 'static')])) as JayElement<RootElementViewState, RootElementRefs>;

            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
        })

        it('should allow using component APIs', () => {
            referenceManager.addComponnetRef(id1, jayComponent);

            jayRootElement = referenceManager.applyToElement(jayRootElement)

            let summary = jayRootElement.refs.id1.getItemSummary()
            expect(summary).toBe('item hello - false');
        })

    })

    describe('dynamic list of referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ComponentCollectionProxy<ItemVS, ItemComponent>
        }

        let jayComponent: ItemComponent,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback;
        beforeEach(() => {
            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
              e('div', {}, [
                  childComp((props, options) => jayComponent = Item(props, options),
                    vs => ({text: 'hello', dataId: 'AAA'}), 'static')])) as JayElement<RootElementViewState, RootElementRefs>;

            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
        })

        it('should allow using component APIs', () => {
            const ref = new ElementReference(jayComponent, DATA_CONTEXT, COORDINATE);
            referenceManager.addStaticRef(id1, ref);

            jayRootElement = referenceManager.applyToElement(jayRootElement)

            let summaries = jayRootElement.refs.id1.map((comp, vs, coordinate) => comp,getItemSummary())
            expect(summaries).toBe('');
        })

    })

});
