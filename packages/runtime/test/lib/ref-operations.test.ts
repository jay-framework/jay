import {beforeEach, describe, expect, it} from '@jest/globals'
import {HTMLElementRefImpl, ReferencesManager} from "../../lib/node-reference";
import {childComp, ConstructContext, dynamicElement as de, element as e, forEach} from "../../lib/";
import {JayElement} from "../../lib";
import {ComponentCollectionProxy, HTMLElementCollectionProxy, HTMLElementProxy} from "../../lib/node-reference-types";
import {Item, ItemComponent, ItemProps, ItemVS} from "./comps/item";
import '../../lib/element-test-types';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const id1 = 'id1';
const DATA_CONTEXT = 'DataContext'
const DATA_CONTEXT_1 = 'DataContext 1'
const DATA_CONTEXT_2 = 'DataContext 2'
const COORDINATE = id1
const COORDINATE_11 = `${id1}.1`
const COORDINATE_12 = `${id1}.2`
const ITEM_PROPS = {text: 'hello', dataId: 'A'};
const ITEM_PROPS_2 = {text: 'hi', dataId: 'B'};
const ITEM_PROPS_3 = {text: 'hey there', dataId: 'C'};

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
            const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE);
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

        let je1, je2, refs_id1,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          referenceManager: ReferencesManager, mockCallback, mockCallback2;

        beforeEach(() => {
            je1 = e('div', {}, [SOME_VALUE]);
            je2 = e('div', {}, [ANOTHER_VALUE]);
            jayRootElement = e('div', {}, [je1, je2]) as JayElement<RootElementViewState, RootElementRefs>;
            referenceManager = new ReferencesManager();
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);
            refs_id1 = [
                new HTMLElementRefImpl(je1.dom, DATA_CONTEXT_1, COORDINATE_11),
                new HTMLElementRefImpl(je2.dom, DATA_CONTEXT_2, COORDINATE_12)
            ]
            refs_id1.forEach(_ => referenceManager.addDynamicRef(id1, _));
            jayRootElement = referenceManager.applyToElement(jayRootElement)
        })

        it("map should run for each referenced element proxy", () => {
            mockCallback.mockReturnValueOnce(SOME_VALUE).mockReturnValueOnce(ANOTHER_VALUE)
            let execResult = jayRootElement.refs.id1.map(mockCallback)

            expect(execResult.length).toBe(2);
            expect(execResult).toEqual([SOME_VALUE, ANOTHER_VALUE]);
            expect(mockCallback.mock.calls.length).toBe(2);
            expect(mockCallback.mock.calls[0][0]).toBe(refs_id1[0]);
            expect(mockCallback.mock.calls[0][1]).toBe(DATA_CONTEXT_1);
            expect(mockCallback.mock.calls[1][0]).toBe(refs_id1[1]);
            expect(mockCallback.mock.calls[1][1]).toBe(DATA_CONTEXT_2);
        })

        it("find should find the first element proxy meeting a criteria", () => {
            let element2 = jayRootElement.refs.id1.find(vs => vs === DATA_CONTEXT_2)

            expect(element2).toBe(refs_id1[1])
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
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>, mockCallback;
        beforeEach(() => {
            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
              e('div', {}, [
                  childComp((props: ItemProps) => jayComponent = Item(props),
                    vs => ({text: 'hello', dataId: 'AAA'}), id1)])) as JayElement<RootElementViewState, RootElementRefs>;

            mockCallback = jest.fn(() => undefined);
        })

        it('should allow using component APIs', () => {
            let summary = jayRootElement.refs.id1.getItemSummary()
            expect(summary).toBe('item hello - false');
        })

    })

    describe('dynamic list of referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ComponentCollectionProxy<ItemVS, ItemComponent>
        }

        let jayComponents: ItemComponent[],
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          mockCallback;
        const viewState = {
            items: [
                {id: '1', props: ITEM_PROPS},
                {id: '2', props: ITEM_PROPS_2},
                {id: '3', props: ITEM_PROPS_3}
            ]
        }
        beforeEach(() => {
            jayComponents = [];
            jayRootElement = ConstructContext.withRootContext(viewState, () =>
              de('div', {}, [
                  forEach((vs: typeof viewState) => vs.items,
                    (item) =>
                      childComp((props) => {
                          let comp = Item(props as ItemProps);
                          jayComponents.push(comp)
                          return comp;
                      }, vs => vs.props, id1),
                    'id')
              ])) as JayElement<RootElementViewState, RootElementRefs>;

            mockCallback = jest.fn();
        })

        it('should allow using component APIs', () => {
            let summaries = jayRootElement.refs.id1.map((comp, vs, coordinate) => comp.getItemSummary())
            expect(summaries).toEqual(["item hello - false", "item hi - false", "item hey there - false"]);
        })

    })

});
