import {
    childComp,
    ConstructContext,
    dynamicElement as de,
    element as e,
    forEach,
    HTMLElementCollectionProxy,
    JayEventHandlerWrapper,
    ReferencesManager,
    RenderElementOptions,
} from '../../lib/';
import { JayElement, HTMLElementProxy } from '../../lib';
import { Item, ItemProps } from './comps/item';
import '../../lib/element-test-types';
import { ItemRef, ItemRefs } from './comps/item-refs';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const THIRD_VALUE = 'third text value';
const UPDATED_ANOTHER_VALUE = 'updated another text value';
const id1 = '1';
const id2 = '2';
const id3 = '3';
const refName1 = 'refName1';
const refName2 = 'refName2';
const VIEW_STATE = 'DataContext';
const COORDINATE = [refName1];
const COORDINATE_11 = [id1, refName1];
const COORDINATE_12 = [id2, refName1];
const COORDINATE_22 = [id2, refName2];

const ITEM_PROPS = { text: 'hello', dataId: 'A' };
const ITEM_PROPS_2 = { text: 'hi', dataId: 'B' };
const ITEM_PROPS_3 = { text: 'hey there', dataId: 'C' };

describe('ReferencesManager events', () => {
    describe('single referenced element', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            refName1: HTMLElementProxy<RootElementViewState, HTMLDivElement>;
        }

        function mkJayElement(eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined) {
            let jayElement1, jayElement2, mockCallback, mockCallback2;
            let options: RenderElementOptions = { eventWrapper };
            let [refManager, [ref]] = ReferencesManager.for(options, [refName1], [], [], []);
            let jayRootElement = ConstructContext.withRootContext<string, RootElementRefs>(
                VIEW_STATE,
                refManager,
                () => {
                    // const ref = elemRef(refName1);
                    jayElement1 = e('div', {}, [SOME_VALUE], ref());
                    jayElement2 = e('div', {}, [SOME_VALUE]);
                    return e('div', {}, [jayElement1, jayElement2]) as JayElement<
                        RootElementViewState,
                        RootElementRefs
                    >;
                },
            );
            mockCallback = vi.fn(() => undefined);
            mockCallback2 = vi.fn(() => undefined);

            return { jayElement1, jayElement2, jayRootElement, mockCallback, mockCallback2 };
        }

        describe('register events using addEventListener', () => {
            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                let { jayRootElement, mockCallback, jayElement1 } = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });
        });

        describe('regular events', () => {
            it('should support the regular event registration', () => {
                let { jayRootElement, mockCallback, jayElement1 } = mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });

            it('should support the regular event parameters', () => {
                let { jayRootElement, mockCallback, jayElement1 } = mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0].coordinate).toEqual(COORDINATE);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE);
            });

            it('should support event handler wrapper', () => {
                let eventsWrapper = vi.fn((orig, event) => orig(event));
                let { jayRootElement, mockCallback, jayElement1 } = mkJayElement(eventsWrapper);

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayElement1.dom.click();

                expect(eventsWrapper.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls.length).toBe(1);
            });
        });

        describe('native $events', () => {
            it('should support the native event registration', () => {
                let { jayRootElement, mockCallback, mockCallback2, jayElement1 } = mkJayElement();

                jayRootElement.refs.refName1.onclick$(mockCallback).then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback2.mock.calls.length).toBe(1);
            });

            it('should support the native event parameters', () => {
                let { jayRootElement, mockCallback, mockCallback2, jayElement1 } = mkJayElement();

                mockCallback.mockReturnValueOnce(SOME_VALUE);
                jayRootElement.refs.refName1.onclick$(mockCallback).then(mockCallback2);
                jayElement1.dom.click();

                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE);
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual(COORDINATE);

                expect(mockCallback2.mock.calls[0][0]).toEqual({
                    event: SOME_VALUE,
                    viewState: VIEW_STATE,
                    coordinate: COORDINATE,
                });
            });
        });
    });

    describe('dynamic list of referenced elements', () => {
        interface RootElementViewStateItem {
            id: string;
            value: string;
        }
        interface RootElementViewState {
            items: Array<RootElementViewStateItem>;
        }
        interface RootElementRefs {
            refName1: HTMLElementCollectionProxy<RootElementViewStateItem, HTMLDivElement>;
            refName2: HTMLElementCollectionProxy<RootElementViewStateItem, HTMLDivElement>;
        }

        const VIEW_STATE: RootElementViewState = {
            items: [
                { id: id1, value: SOME_VALUE },
                { id: id2, value: ANOTHER_VALUE },
                { id: id3, value: THIRD_VALUE },
            ],
        };

        const VIEW_STATE_2: RootElementViewState = {
            items: [
                { id: id1, value: SOME_VALUE },
                { id: id2, value: UPDATED_ANOTHER_VALUE },
                { id: id3, value: THIRD_VALUE },
            ],
        };

        const VIEW_STATE_EMPTY: RootElementViewState = {
            items: [],
        };

        function mkJayElement(viewState = VIEW_STATE) {
            let jayElements = [],
                jayElements2 = [],
                mockCallback,
                mockCallback2;
            let [refManager, [ref_1, ref_2]] = ReferencesManager.for(
                {},
                [],
                [refName1, refName2],
                [],
                [],
            );
            let jayRootElement = ConstructContext.withRootContext<
                RootElementViewState,
                RootElementRefs
            >(viewState, refManager, () => {
                return de('div', {}, [
                    forEach(
                        (vs) => vs.items,
                        (item: RootElementViewStateItem) => {
                            let element = e('div', {}, [item.value], ref_1());
                            jayElements.push(element);
                            return element;
                        },
                        'id',
                    ),
                    forEach(
                        (vs) => vs.items,
                        (item: RootElementViewStateItem) => {
                            let element = e('div', {}, [item.value], ref_2());
                            jayElements2.push(element);
                            return element;
                        },
                        'id',
                    ),
                ]);
            });
            mockCallback = vi.fn(() => undefined);
            mockCallback2 = vi.fn(() => undefined);

            return { jayElements, jayElements2, jayRootElement, mockCallback, mockCallback2 };
        }

        describe('events using addEventListener', () => {
            it('should register events handlers on an element', () => {
                let { jayRootElement, jayElements, mockCallback } = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });

            it('should remove events handlers from an element', () => {
                let { jayRootElement, jayElements, mockCallback } = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayRootElement.refs.refName1.removeEventListener('click', mockCallback);
                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            });

            it('should enrich events with the data context', () => {
                let { jayRootElement, jayElements, mockCallback } = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);

                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE.items[1]);
            });

            it('should enrich events with the updated data context', () => {
                let { jayRootElement, jayElements, mockCallback } = mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayRootElement.update(VIEW_STATE_2);

                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBeInstanceOf(Event);
                expect(mockCallback.mock.calls[0][0].viewState).toBe(VIEW_STATE_2.items[1]);
            });

            it('should register events on all elements with the same ref id (not mix between different collection refs)', () => {
                let { jayRootElement, jayElements2, jayElements, mockCallback, mockCallback2 } =
                    mkJayElement();

                jayRootElement.refs.refName1.addEventListener('click', mockCallback);
                jayRootElement.refs.refName2.addEventListener('click', mockCallback2);

                jayElements[0].dom.click();
                jayElements[1].dom.click();
                jayElements2[2].dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
                expect(mockCallback2.mock.calls.length).toBe(1);
            });
        });

        describe('regular events', () => {
            it('should support the regular event registration', () => {
                let { jayRootElement, jayElements, jayElements2, mockCallback } = mkJayElement();

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayElements[0].dom.click();
                jayElements[1].dom.click();
                jayElements2[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
            });

            it('should support the regular event parameters', () => {
                let { jayRootElement, jayElements, jayElements2, mockCallback, mockCallback2 } =
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
            });
        });

        describe('native events', () => {
            it('should support the regular event registration', () => {
                let { jayRootElement, jayElements, mockCallback, mockCallback2 } = mkJayElement();

                jayRootElement.refs.refName1.onclick$(mockCallback).then(mockCallback2);
                jayElements[0].dom.click();
                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(2);
                expect(mockCallback2.mock.calls.length).toBe(2);
            });

            it('should support the regular event parameters', () => {
                let { jayRootElement, jayElements, mockCallback, mockCallback2 } = mkJayElement();

                mockCallback.mockReturnValueOnce(SOME_VALUE).mockReturnValueOnce(ANOTHER_VALUE);
                jayRootElement.refs.refName1.onclick$(mockCallback).then(mockCallback2);
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
            });
        });

        describe('empty list of elements', () => {
            it('should enrich root element with the ref and allow registering events on element (using onclick)', () => {
                let { jayRootElement, jayElements, mockCallback } = mkJayElement(VIEW_STATE_EMPTY);

                jayRootElement.refs.refName1.onclick(mockCallback);
                jayRootElement.update(VIEW_STATE);

                jayElements[1].dom.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });
        });
    });

    describe('single referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            refName1: ItemRef<RootElementViewState>;
        }

        function mkElement(eventWrapper: JayEventHandlerWrapper<any, any, any> = undefined) {
            let jayComponent: ItemRef<RootElementViewState>;
            let [refManager, [comp]] = ReferencesManager.for(
                { eventWrapper },
                [],
                [],
                [refName1],
                [],
            );
            let jayRootElement: JayElement<RootElementViewState, RootElementRefs> =
                ConstructContext.withRootContext(VIEW_STATE, refManager, () => {
                    return e('div', {}, [
                        childComp(
                            (props) => (jayComponent = Item(props as ItemProps)),
                            (vs) => ITEM_PROPS,
                            comp(),
                        ),
                    ]);
                }) as JayElement<RootElementViewState, RootElementRefs>;
            let mockCallback = vi.fn(() => undefined);
            return { jayRootElement, mockCallback, jayComponent };
        }

        describe('defaults tests', () => {
            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                let { jayRootElement, jayComponent, mockCallback } = mkElement();
                jayRootElement.refs.refName1.addEventListener('remove', mockCallback);
                let button = jayComponent.element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });

            it('should enrich root element with the ref and allow registering events using onremove', () => {
                let { jayRootElement, jayComponent, mockCallback } = mkElement();
                jayRootElement.refs.refName1.onremove(mockCallback);
                let button = jayComponent.element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });

            it('event parameters', () => {
                let { jayRootElement, jayComponent, mockCallback } = mkElement();
                jayRootElement.refs.refName1.onremove(mockCallback);
                let button = jayComponent.element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback).toHaveBeenCalledWith({
                    event: 'item hello - false is removed',
                    viewState: VIEW_STATE,
                    coordinate: [refName1],
                });
            });

            it('event parameters when using addEventListener', () => {
                let { jayRootElement, jayComponent, mockCallback } = mkElement();
                jayRootElement.refs.refName1.addEventListener('remove', mockCallback);
                let button = jayComponent.element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback).toHaveBeenCalledWith({
                    event: 'item hello - false is removed',
                    viewState: VIEW_STATE,
                    coordinate: [refName1],
                });
            });

            it('should remove event using removeEventListener', () => {
                let { jayRootElement, jayComponent, mockCallback } = mkElement();
                jayRootElement.refs.refName1.addEventListener('remove', mockCallback);
                jayRootElement.refs.refName1.removeEventListener('remove', mockCallback);
                let button = jayComponent.element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            });
        });

        it('should support event wrapper', () => {
            let eventWrapper = vi.fn((orig, event) => orig(event));
            let { jayRootElement, jayComponent } = mkElement(eventWrapper);
            let mockCallback = vi.fn(() => undefined);

            jayRootElement.refs.refName1.onremove(mockCallback);
            let button = jayComponent.element.dom.querySelector(
                'button[data-id="remove"]',
            ) as HTMLButtonElement;
            button.click();

            expect(eventWrapper.mock.calls.length).toBe(1);
            expect(mockCallback.mock.calls.length).toBe(1);
        });
    });

    describe('dynamic list of referenced components', () => {
        interface ItemViewState {
            id: string;
            props: ItemProps;
        }
        interface ViewState {
            items: ItemViewState[];
        }
        interface RootElementRefs {
            refName1: ItemRefs<ItemViewState>;
        }

        let jayComponents: ItemRef<ViewState>[],
            jayRootElement: JayElement<ViewState, RootElementRefs>,
            mockCallback;
        const viewState: ViewState = {
            items: [
                { id: '1', props: ITEM_PROPS },
                { id: '2', props: ITEM_PROPS_2 },
                { id: '3', props: ITEM_PROPS_3 },
            ],
        };
        const emptyViewState: ViewState = {
            items: [],
        };

        function constructElement(viewState: ViewState) {
            let [refManager, [ref_1]] = ReferencesManager.for({}, [], [], [], [refName1]);
            return ConstructContext.withRootContext(viewState, refManager, () => {
                return de('div', {}, [
                    forEach(
                        (vs: typeof viewState) => vs.items,
                        (item) =>
                            childComp(
                                (props) => {
                                    let comp = Item<ViewState>(props as ItemProps);
                                    jayComponents.push(comp);
                                    return comp;
                                },
                                (vs) => ITEM_PROPS,
                                ref_1(),
                            ),
                        'id',
                    ),
                ]);
            });
        }

        describe('default tests', () => {
            beforeEach(() => {
                jayComponents = [];
                jayRootElement = constructElement(viewState) as JayElement<
                    ViewState,
                    RootElementRefs
                >;

                mockCallback = vi.fn();
            });

            it('should enrich root element with the ref and allow registering events using addEventListener', () => {
                jayRootElement.refs.refName1.addEventListener('remove', mockCallback);
                let button = jayComponents[1].element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });

            it('should enrich root element with the ref and allow registering events using onremove', () => {
                jayRootElement.refs.refName1.onremove(mockCallback);
                let button = jayComponents[1].element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });

            it('event parameters', () => {
                jayRootElement.refs.refName1.onremove(mockCallback);
                let button = jayComponents[1].element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
                expect(mockCallback.mock.calls[0][0].event).toBe('item hello - false is removed');
                expect(mockCallback.mock.calls[0][0].viewState).toEqual(viewState.items[1]);
                expect(mockCallback.mock.calls[0][0].coordinate).toEqual([
                    viewState.items[1].id,
                    refName1,
                ]);
            });

            it('should remove event using removeEventListener', () => {
                jayRootElement.refs.refName1.addEventListener('remove', mockCallback);
                jayRootElement.refs.refName1.removeEventListener('remove', mockCallback);
                let button = jayComponents[1].element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(0);
            });
        });

        describe('empty list of components', () => {
            beforeEach(() => {
                jayComponents = [];
                jayRootElement = constructElement(emptyViewState) as JayElement<
                    ViewState,
                    RootElementRefs
                >;

                mockCallback = vi.fn();
            });

            it('should enrich root element with the ref and allow registering events on components (using onremove)', () => {
                jayRootElement.refs.refName1.onremove(mockCallback);
                jayRootElement.update(viewState);
                let button = jayComponents[1].element.dom.querySelector(
                    'button[data-id="remove"]',
                ) as HTMLButtonElement;
                button.click();

                expect(mockCallback.mock.calls.length).toBe(1);
            });
        });
    });
});
