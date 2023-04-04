import {beforeEach, describe, expect, it} from '@jest/globals'
import {HTMLElementRefImpl, ReferencesManager} from "../../lib/node-reference";
import {childComp, ConstructContext, dynamicElement as de, element as e, forEach} from "../../lib/";
import {JayElement, HTMLElementProxy} from "../../lib";
import {Item, ItemProps} from "./comps/item";
import '../../lib/element-test-types';
import {ItemRef, ItemRefs} from "./comps/item-refs";

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const id1 = 'id1';
const id2 = 'id2';
const DATA_CONTEXT = 'DataContext'
const COORDINATE = [id1]
const COORDINATE_11 = [id1, '1']
const COORDINATE_12 = [id1, '2']
const COORDINATE_21 = [id2, '1']

const ITEM_PROPS = {text: 'hello', dataId: 'A'};
const ITEM_PROPS_2 = {text: 'hi', dataId: 'B'};
const ITEM_PROPS_3 = {text: 'hey there', dataId: 'C'};
const UNIT_WRAPPER = (orig, event) => orig(event);


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
                const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE, UNIT_WRAPPER);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.addEventListener('click', mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })
        });

        describe('regular events', () => {
            it('should support the regular event registration', () => {
                const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE, UNIT_WRAPPER);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            })

            it('should support the regular event parameters', () => {
                const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE, UNIT_WRAPPER);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0].coordinate).toBe(COORDINATE);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(DATA_CONTEXT);
            })

            it('should support event handler wrapper', () => {
                let eventsWrapper = jest.fn((orig, event) => orig(event));
                const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE, eventsWrapper);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.onclick(mockCallback)
                jayElement1.dom.click();

                expect(eventsWrapper.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls.length).toBe(1);
            })
        })

        describe('native $events', () => {
            it('should support the native event registration', () => {
                const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE_11, UNIT_WRAPPER);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback2.mock.calls.length).toBe(1);
            })

            it('should support the native event parameters', () => {
                const ref = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE_11, UNIT_WRAPPER);
                referenceManager.addStaticRef(id1, ref);

                jayRootElement = referenceManager.applyToElement(jayRootElement)

                mockCallback.mockReturnValueOnce(SOME_VALUE)
                jayRootElement.refs.id1.$onclick(mockCallback)
                  .then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][0].coordinate).toBe(COORDINATE_11);

                expect(mockCallback2.mock.calls[0][0]).toEqual({event: SOME_VALUE, viewState: DATA_CONTEXT, coordinate: COORDINATE_11});
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

            ref1 = new HTMLElementRefImpl(jayElement1.dom, DATA_CONTEXT, COORDINATE_11, UNIT_WRAPPER);
            ref2 = new HTMLElementRefImpl(jayElement2.dom, DATA_CONTEXT, COORDINATE_12, UNIT_WRAPPER);
            ref3 = new HTMLElementRefImpl(jayElement3.dom, DATA_CONTEXT, COORDINATE_21, UNIT_WRAPPER);
            referenceManager.addDynamicRef(id1, ref1);
            referenceManager.addDynamicRef(id1, ref2);
            referenceManager.addDynamicRef(id2, ref3);

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
                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(DATA_CONTEXT);
            })

            it("should enrich events with the updated data context", () => {
                referenceManager.getRefCollection(id1).addEventListener('click', mockCallback);
                ref1.update(ANOTHER_VALUE)

                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(ANOTHER_VALUE);
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

                expect(mockCallback.mock.calls[0][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][0].coordinate).toBe(COORDINATE_11);
                expect(mockCallback.mock.calls[1][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[1][0].coordinate).toBe(COORDINATE_12);
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

                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[0][0].coordinate).toBe(COORDINATE_11);

                expect(mockCallback2.mock.calls[0][0].event).toBe(SOME_VALUE);
                expect(mockCallback2.mock.calls[0][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback2.mock.calls[0][0].coordinate).toBe(COORDINATE_11);

                expect(mockCallback.mock.calls[1][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[1][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback.mock.calls[1][0].coordinate).toBe(COORDINATE_12);

                expect(mockCallback2.mock.calls[1][0].event).toBe(ANOTHER_VALUE);
                expect(mockCallback2.mock.calls[1][0].viewState).toBe(DATA_CONTEXT);
                expect(mockCallback2.mock.calls[1][0].coordinate).toBe(COORDINATE_12);
            })
        })

        describe('empty list of elements', () => {
            interface ViewState {
                items: Array<string>
            }
            const EMPTY_VS = {items: []}
            const FULL_VS = {items: ["one", "two", "three"]}
            interface RootElementRefs {
                id1: HTMLElementProxy<RootElementViewState, HTMLDivElement>
            }
            function constructElement(viewState: ViewState): JayElement<ViewState, RootElementRefs> {
                return ConstructContext.withRootContext(viewState, () =>
                  de('div', {}, [
                      forEach((vs: typeof viewState) => vs.items,
                        (item) =>
                          e('div', {ref: id1, "data-id": item}, [item]),
                        'id')
                  ]), undefined, [id1]);
            }

            it('should enrich root element with the ref and allow registering events on element (using onclick)', () => {
                let jayElement = constructElement(EMPTY_VS)

                jayElement.refs.id1.onclick(mockCallback);
                jayElement.update(FULL_VS);

                let button = jayElement.dom.querySelector('div[data-id="two"]') as HTMLDivElement;
                button.click();

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
                jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
                  e('div', {}, [
                      childComp((props) => jayComponent = Item(props as ItemProps),
                        vs => ITEM_PROPS, id1)])) as JayElement<RootElementViewState, RootElementRefs>;
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
                expect(mockCallback.mock.calls[0][0]).toEqual({event: 'item hello - false is removed', viewState: DATA_CONTEXT, coordinate: [id1]});
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
            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () =>
              e('div', {}, [
                  childComp((props) => jayComponent = Item(props as ItemProps),
                    vs => ITEM_PROPS, id1)]), {eventWrapper}, []) as JayElement<RootElementViewState, RootElementRefs>;
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
                      }, vs => ITEM_PROPS, id1),
                    'id')
              ]), undefined, [id1]);
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
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual([viewState.items[1].id, id1]);
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
