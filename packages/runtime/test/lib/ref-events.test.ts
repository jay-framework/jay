import {beforeEach, describe, expect, it} from '@jest/globals'
import {elemCollectionRef, elemRef, HTMLElementRefImpl, ReferencesManager} from "../../lib/node-reference";
import {
    childComp,
    ConstructContext,
    dynamicElement as de,
    element as e,
    forEach, HTMLElementCollectionProxy, JayEventHandlerWrapper,
    RenderElementOptions
} from "../../lib/";
import {JayElement, HTMLElementProxy} from "../../lib";
import {Item, ItemProps} from "./comps/item";
import '../../lib/element-test-types';
import {ItemRef, ItemRefs} from "./comps/item-refs";

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const THIRD_VALUE = 'third text value';
const UPDATED_ANOTHER_VALUE = 'updated another text value';
const id1 = '1'
const id2 = '2';
const id3 = '3'
const refName1 = 'refName1';
const refName2 = 'refName2';
const VIEW_STATE = 'DataContext'
const COORDINATE = [refName1]
const COORDINATE_11 = [id1, refName1]
const COORDINATE_12 = [id2, refName1]
const COORDINATE_22 = [id2, refName2]

const ITEM_PROPS = {text: 'hello', dataId: 'A'};
const ITEM_PROPS_2 = {text: 'hi', dataId: 'B'};
const ITEM_PROPS_3 = {text: 'hey there', dataId: 'C'};
const UNIT_WRAPPER = (orig, event) => orig(event);


describe('ReferencesManager events', () => {

    describe('single referenced element', () => {

        interface RootElementViewState {}
        interface RootElementRefs {
            refName1: HTMLElementProxy<RootElementViewState, HTMLDivElement>
        }

        function mkJayElement(eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined) {
            let jayElement1, jayElement2, mockCallback, mockCallback2;
            let options: RenderElementOptions = {eventWrapper}
            let jayRootElement = ConstructContext.withRootContext<string, RootElementRefs>(VIEW_STATE, () => {
                jayElement1 = e('div', {}, elemRef(refName1),[SOME_VALUE]);
                jayElement2 = e('div', {}, null, [SOME_VALUE]);
                return e('div', {}, null, [jayElement1, jayElement2]) as JayElement<RootElementViewState, RootElementRefs>;
            }, options)
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);

            return {jayElement1, jayElement2, jayRootElement, mockCallback, mockCallback2}
        }

        describe('register events using addEventListener', () => {
            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                let {jayRootElement, mockCallback, jayElement1} = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })
        });

        describe('regular events', () => {
            it('should support the regular event registration', () => {
                let {jayRootElement, mockCallback, jayElement1} = mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it('should support the regular event parameters', () => {
                let {jayRootElement, mockCallback, jayElement1} = mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0].coordinate).toEqual(COORDINATE);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE);
            })

            it('should support event handler wrapper', () => {
                let eventsWrapper = jest.fn((orig, event) => orig(event));
                let {jayRootElement, mockCallback, jayElement1} = mkJayElement(eventsWrapper);

                jayRootElement.refs.refName1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(eventsWrapper.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls.length).toBe(1);
            })
        })

        describe('native $events', () => {
            it('should support the native event registration', () => {
                let {jayRootElement, mockCallback, mockCallback2, jayElement1} = mkJayElement();

                jayRootElement.refs.refName1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback2.mock.calls.length).toBe(1);
            })

            it('should support the native event parameters', () => {
                let {jayRootElement, mockCallback, mockCallback2, jayElement1} = mkJayElement();

                mockCallback.mockReturnValueOnce(SOME_VALUE)
                jayRootElement.refs.refName1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE);
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual(COORDINATE);

                expect(mockCallback2.mock.calls[0][0]).toEqual({event: SOME_VALUE, viewState: VIEW_STATE, coordinate: COORDINATE});
            })
        })

    })

    describe('dynamic list of referenced elements', () => {

        interface RootElementViewStateItem {
            id: string, value: string
        }
        interface RootElementViewState {
            items: Array<RootElementViewStateItem>
        }
        interface RootElementRefs {
            refName1: HTMLElementCollectionProxy<RootElementViewState, HTMLDivElement>
            refName2: HTMLElementCollectionProxy<RootElementViewState, HTMLDivElement>
        }

        const VIEW_STATE: RootElementViewState = {
            items: [
                {id: id1, value: SOME_VALUE},
                {id: id2, value: ANOTHER_VALUE},
                {id: id3, value: THIRD_VALUE}
            ]
        }

        const VIEW_STATE_2: RootElementViewState = {
            items: [
                {id: id1, value: SOME_VALUE},
                {id: id2, value: UPDATED_ANOTHER_VALUE},
                {id: id3, value: THIRD_VALUE}
            ]
        }

        const VIEW_STATE_EMPTY: RootElementViewState = {
            items: []
        }

        function mkJayElement(viewState = VIEW_STATE) {
            let jayElements = [], jayElements2 = [], mockCallback, mockCallback2;
            let jayRootElement = ConstructContext.withRootContext<RootElementViewState, RootElementRefs>(viewState, () => {
                const ref_1 = elemCollectionRef(refName1);
                const ref_2 = elemCollectionRef(refName2);
                return de('div', {}, undefined, [
                    forEach(vs => vs.items, (item: RootElementViewStateItem) => {
                        let element = e('div', {}, ref_1(),[item.value]);
                        jayElements.push(element);
                        return element;
                    }, "id"),
                    forEach(vs => vs.items, (item: RootElementViewStateItem) => {
                        let element = e('div', {}, ref_2(),[item.value]);
                        jayElements2.push(element);
                        return element;
                    }, "id")
                ])
            })
            mockCallback = jest.fn(() => undefined);
            mockCallback2 = jest.fn(() => undefined);

            return {jayElements, jayElements2, jayRootElement, mockCallback, mockCallback2}
        }

        describe('events using addEventListener', () => {
            it("should register events handlers on an element", () => {
                let {jayRootElement, jayElements, mockCallback} = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayElements[1].dom.click()

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it("should remove events handlers from an element", () => {
                let {jayRootElement, jayElements, mockCallback} = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayRootElement.refs.refName1.removeEventListener('click', mockCallback);
                jayElements[1].dom.click()

                expect(mockCallback.mock.calls.length).toBe(0);
            })

            it("should enrich events with the data context", () => {
                let {jayRootElement, jayElements, mockCallback} = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);

                jayElements[1].dom.click()

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE.items[1]);
            })

            it("should enrich events with the updated data context", () => {
                let {jayRootElement, jayElements, mockCallback} = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayRootElement.update(VIEW_STATE_2)

                jayElements[1].dom.click()

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE_2.items[1]);
            })

            it("should register events on all elements with the same ref id (not mix between different collection refs)", () => {
                let {jayRootElement, jayElements2, jayElements, mockCallback, mockCallback2} =
                    mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayRootElement.refs.refName2.addEventListener('click', mockCallback2);

                jayElements[0].dom.click()
                jayElements[1].dom.click()
                jayElements2[2].dom.click()

                expect(mockCallback.mock.calls.length).toBe(2);
                expect(mockCallback2.mock.calls.length).toBe(1);
            })
        });

        describe('regular events', () => {
            it("should support the regular event registration", () => {
                let {jayRootElement, jayElements, jayElements2, mockCallback} =
                    mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayElements[0].dom.click();
                jayElements[1].dom.click();
                jayElements2[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            })

            it("should support the regular event parameters", () => {
                let {jayRootElement, jayElements, jayElements2, mockCallback, mockCallback2} =
                    mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayRootElement.refs.refName2.onclick(mockCallback2);
                jayElements[0].dom.click();
                jayElements[1].dom.click();
                jayElements2[1].dom.click();

                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE.items[0]);
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual(COORDINATE_11);
                expect(mockCallback.mock.calls[1][0].viewState).toBe(VIEW_STATE.items[1]);
                expect(mockCallback.mock.calls[1][0].coordinate).toEqual(COORDINATE_12);
                expect(mockCallback2.mock.calls[0][0].viewState).toBe(VIEW_STATE.items[1]);
                expect(mockCallback2.mock.calls[0][0].coordinate).toEqual(COORDINATE_22);
            })
        })

        describe('native events', () => {
            it("should support the regular event registration", () => {
                let {jayRootElement, jayElements, mockCallback, mockCallback2} =
                    mkJayElement();

                jayRootElement.refs.refName1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElements[0].dom.click();
                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
                expect(mockCallback2.mock.calls.length).toBe(2);
            })

            it("should support the regular event parameters", () => {
                let {jayRootElement, jayElements, mockCallback, mockCallback2} =
                    mkJayElement();

                mockCallback
                    .mockReturnValueOnce(SOME_VALUE)
                    .mockReturnValueOnce(ANOTHER_VALUE)
                jayRootElement.refs.refName1.$onclick(mockCallback)
                    .then(mockCallback2);
                jayElements[0].dom.click();
                jayElements[1].dom.click();

                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE.items[0]);
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual(COORDINATE_11);

                expect(mockCallback2.mock.calls[0][0].event).toBe(SOME_VALUE);
                expect(mockCallback2.mock.calls[0][0].viewState).toBe(VIEW_STATE.items[0]);
                expect(mockCallback2.mock.calls[0][0].coordinate).toEqual(COORDINATE_11);

                expect(mockCallback.mock.calls[1][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[1][0].viewState).toBe(VIEW_STATE.items[1]);
                expect(mockCallback.mock.calls[1][0].coordinate).toEqual(COORDINATE_12);

                expect(mockCallback2.mock.calls[1][0].event).toBe(ANOTHER_VALUE);
                expect(mockCallback2.mock.calls[1][0].viewState).toBe(VIEW_STATE.items[1]);
                expect(mockCallback2.mock.calls[1][0].coordinate).toEqual(COORDINATE_12);
            })
        })

        describe('empty list of elements', () => {
            it('should enrich root element with the ref and allow registering events on element (using onclick)', () => {
                let {jayRootElement, jayElements, mockCallback, mockCallback2} =
                    mkJayElement(VIEW_STATE_EMPTY);

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayRootElement.update(VIEW_STATE);

                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })
        })
    })

    describe('single referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            id1: ItemRef<RootElementViewState>
        }

        let jayComponent: ItemRef<RootElementViewState>,
          jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
          mockCallback;

        describe('defaults tests', () => {
            beforeEach(() => {
                jayRootElement = ConstructContext.withRootContext(VIEW_STATE, () =>
                  e('div', {}, [
                      childComp((props) => jayComponent = Item(props as ItemProps),
                        vs => ITEM_PROPS, refName1)])) as JayElement<RootElementViewState, RootElementRefs>;
                mockCallback = jest.fn(() => undefined);
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
                expect(mockCallback.mock.calls[0][0]).toEqual({event: 'item hello - false is removed', viewState: VIEW_STATE, coordinate: [refName1]});
            })

            it('should remove event using removeEventListener', () => {
                jayRootElement.refs.id1.addEventListener('remove', mockCallback);
                jayRootElement.refs.id1.removeEventListener('remove', mockCallback);
                let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            })

        })

        it('should support event wrapper', () => {
            let eventWrapper = jest.fn((orig, event) => orig(event));
            jayRootElement = ConstructContext.withRootContext(VIEW_STATE, () =>
              e('div', {}, [
                  childComp((props) => jayComponent = Item(props as ItemProps),
                    vs => ITEM_PROPS, refName1)]), {eventWrapper}, []) as JayElement<RootElementViewState, RootElementRefs>;
            mockCallback = jest.fn(() => undefined);
            jayRootElement.refs.id1.onremove(mockCallback);
            let button = jayComponent.element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();

            expect(eventWrapper.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls.length).toBe(1);
        })

    })

    describe('dynamic list of referenced components', () => {
        interface ItemViewState {
            id: string, props: ItemProps
        }
        interface ViewState {
            items: ItemViewState[]
        }
        interface RootElementRefs {
            id1: ItemRefs<ItemViewState>
        }

        let jayComponents: ItemRef<ViewState>[],
          jayRootElement: JayElement<ViewState, RootElementRefs>,
          mockCallback;
        const viewState: ViewState = {
            items: [
                {id: '1', props: ITEM_PROPS},
                {id: '2', props: ITEM_PROPS_2},
                {id: '3', props: ITEM_PROPS_3}
            ]
        }
        const emptyViewState: ViewState = {
            items: []
        }

        function constructElement(viewState: ViewState) {
            return ConstructContext.withRootContext(viewState, () =>
              de('div', {}, [
                  forEach((vs: typeof viewState) => vs.items,
                    (item) =>
                      childComp((props) => {
                          let comp = Item<ViewState>(props as ItemProps);
                          jayComponents.push(comp)
                          return comp;
                      }, vs => ITEM_PROPS, refName1),
                    'id')
              ]), undefined, [refName1]);
        }

        describe('default tests', () => {
            beforeEach(() => {
                jayComponents = [];
                jayRootElement = constructElement(viewState) as JayElement<ViewState, RootElementRefs>;

                mockCallback = jest.fn();
            })

            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                jayRootElement.refs.id1.addEventListener('remove', mockCallback);
                let button = jayComponents[1].element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it('should enrich root element with the ref and allow registering events using onremove', () => {
                jayRootElement.refs.id1.onremove(mockCallback);
                let button = jayComponents[1].element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it('event parameters', () => {
                jayRootElement.refs.id1.onremove(mockCallback);
                let button = jayComponents[1].element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBe('item hello - false is removed');
                expect(mockCallback.mock.calls[0][0].viewState).toEqual(viewState.items[1]);
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual([viewState.items[1].id, refName1]);
            })

            it('should remove event using removeEventListener', () => {
                jayRootElement.refs.id1.addEventListener('remove', mockCallback);
                jayRootElement.refs.id1.removeEventListener('remove', mockCallback);
                let button = jayComponents[1].element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            })
        })

        describe('empty list of components', () => {
            beforeEach(() => {
                jayComponents = [];
                jayRootElement = constructElement(emptyViewState) as JayElement<ViewState, RootElementRefs>;

                mockCallback = jest.fn();
            })

            it('should enrich root element with the ref and allow registering events on components (using onremove)', () => {
                jayRootElement.refs.id1.onremove(mockCallback);
                jayRootElement.update(viewState);
                let button = jayComponents[1].element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })
        })

    })
});
