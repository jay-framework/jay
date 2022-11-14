import {beforeEach, describe, expect, it} from '@jest/globals'
import {HTMLElementRefImpl, ReferencesManager} from "../../lib/node-reference";
import {childComp, ConstructContext, dynamicElement as de, element as e, forEach} from "../../lib/";
import {JayElement} from "../../lib";
import {ComponentCollectionProxy, HTMLElementCollectionProxy, HTMLElementProxy} from "../../lib";
import {Item, ItemProps} from "./comps/item";
import '../../lib/element-test-types';
import {ItemComponent} from "./comps/item-types";

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
const UNIT_WRAPPER = (orig, event) => orig(event);

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
            const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE, UNIT_WRAPPER);
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
                new HTMLElementRefImpl(je1.dom, DATA_CONTEXT_1, COORDINATE_11, UNIT_WRAPPER),
                new HTMLElementRefImpl(je2.dom, DATA_CONTEXT_2, COORDINATE_12, UNIT_WRAPPER)
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
            id1: ItemComponent<RootElementViewState>
        }

        let jayComponent: ItemComponent<RootElementViewState>,
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
        const viewState = {
            items: [
                {id: '1', props: ITEM_PROPS},
                {id: '2', props: ITEM_PROPS_2},
                {id: '3', props: ITEM_PROPS_3}
            ]
        }

        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ComponentCollectionProxy<typeof viewState.items[0], ItemComponent<RootElementViewState>>
        }

        let jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          mockCallback;
        beforeEach(() => {
            jayRootElement = ConstructContext.withRootContext(viewState, () =>
              de('div', {}, [
                  forEach((vs: typeof viewState) => vs.items,
                    (item) =>
                      childComp((props) => Item(props as ItemProps), vs => vs.props, id1),
                    'id')
              ])) as JayElement<RootElementViewState, RootElementRefs>;

            mockCallback = jest.fn();
        })

        it('map should allow using component APIs and return array of callback return values', () => {
            let summaries = jayRootElement.refs.id1.map((comp, vs, coordinate) => comp.getItemSummary())
            expect(summaries).toEqual(["item hello - false", "item hi - false", "item hey there - false"]);
        })

        it('map should provide viewState and coordinate', () => {
            let viewStates = []
            let coordinates = []
            jayRootElement.refs.id1.map((comp, vs, coordinate) => {
                viewStates.push(vs);
                coordinates.push(coordinate)
            })
            expect(viewStates).toEqual(viewState.items);
            expect(coordinates).toEqual(["1/id1", "2/id1", "3/id1"]);
        })

        it('should find elements based on viewState', () => {
            let foundComp = jayRootElement.refs.id1.find((vs) => vs.id === viewState.items[1].id)
            expect(foundComp.getItemSummary()).toEqual("item hi - false");
        })
    })

});
