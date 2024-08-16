import { compCollectionRef, compRef, elemCollectionRef, elemRef } from '../../lib/';
import {
    childComp,
    ConstructContext,
    Coordinate,
    dynamicElement as de,
    element as e,
    forEach,
    HTMLNativeExec,
} from '../../lib/';
import { JayElement } from '../../lib';
import { ComponentCollectionProxy, HTMLElementCollectionProxy, HTMLElementProxy } from '../../lib';
import { Item, ItemProps } from './comps/item';
import '../../lib/element-test-types';
import { ItemRef } from './comps/item-refs';

const SOME_VALUE = 'some text in the element';
const ANOTHER_VALUE = 'another text value';
const THIRD_VALUE = 'third text value';
const refName1 = 'refName1';
const refName2 = 'refName2';
const DATA_CONTEXT = 'DataContext';
const id1 = '1';
const id2 = '2';
const id3 = '3';
const COORDINATE_12 = [id2, refName1];
const ITEM_PROPS = { text: 'hello', dataId: 'A' };
const ITEM_PROPS_2 = { text: 'hi', dataId: 'B' };
const ITEM_PROPS_3 = { text: 'hey there', dataId: 'C' };

describe('ReferencesManager operations', () => {
    describe('single referenced element', () => {
        interface RootElementRefs {
            refName1: HTMLElementProxy<string, HTMLDivElement>;
        }

        function mkElement() {
            let jayElement1;
            let jayRootElement = ConstructContext.withRootContext<string, RootElementRefs>(
                DATA_CONTEXT,
                () => {
                    const ref = elemRef(refName1);
                    return e('div', {}, [
                        (jayElement1 = e('div', {}, [SOME_VALUE], ref()))])
                },
            );
            let mockCallback = vi.fn(() => undefined);
            return { jayRootElement, jayElement1, mockCallback };
        }

        it('$exec should run for with the native html element', () => {
            let { jayRootElement, jayElement1, mockCallback } = mkElement();
            jayRootElement.refs.refName1.exec$(mockCallback);
            expect(mockCallback.mock.calls.length).toBe(1);
            expect(mockCallback).toHaveBeenCalledWith(jayElement1.dom, DATA_CONTEXT);
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

        function mkJayElement(viewState = VIEW_STATE) {
            let jayElements = [],
                jayElements2 = [],
                mockCallback,
                mockCallback2;
            let jayRootElement = ConstructContext.withRootContext<
                RootElementViewState,
                RootElementRefs
            >(viewState, () => {
                const ref_1 = elemCollectionRef(refName1);
                const ref_2 = elemCollectionRef(refName2);
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

        function expectRefToJayElement(
            htmlNativeExec: HTMLNativeExec<any, any>,
            jayElement: JayElement<any, any>,
        ) {
            let mockCallback = vi.fn(() => undefined);
            htmlNativeExec.exec$(mockCallback);
            expect(mockCallback.mock.calls.length).toBe(1);
            expect((mockCallback.mock.calls[0] as HTMLElement[])[0]).toBe(jayElement.dom);
        }

        function sameCoordinate(a: Coordinate, b: Coordinate) {
            return (
                a.length === b.length &&
                a.reduce((prev, curr, index) => prev && curr === b[index], true)
            );
        }

        it('map should run for each referenced element proxy', () => {
            let { jayRootElement, jayElements, mockCallback } = mkJayElement();
            mockCallback
                .mockReturnValueOnce(SOME_VALUE)
                .mockReturnValueOnce(ANOTHER_VALUE)
                .mockReturnValueOnce(THIRD_VALUE);
            let execResult = jayRootElement.refs.refName1.map(mockCallback);

            expect(execResult.length).toBe(3);
            expect(execResult).toEqual([SOME_VALUE, ANOTHER_VALUE, THIRD_VALUE]);
            expect(mockCallback.mock.calls.length).toBe(3);
            for (let i = 0; i < 3; i++) {
                expectRefToJayElement(mockCallback.mock.calls[i][0], jayElements[i]);
                expect(mockCallback.mock.calls[i][1]).toBe(VIEW_STATE.items[i]);
                expect(mockCallback.mock.calls[i][2]).toEqual([VIEW_STATE.items[i].id, refName1]);
            }
        });

        it('find should find the first element proxy meeting a criteria based on view state', () => {
            let { jayRootElement, jayElements, mockCallback } = mkJayElement();
            let element2 = jayRootElement.refs.refName1.find((vs) => vs === VIEW_STATE.items[1]);

            expectRefToJayElement(element2, jayElements[1]);
        });

        it('find should find the first element proxy meeting a criteria based on coordinate', () => {
            let { jayRootElement, jayElements, mockCallback } = mkJayElement();
            let element2 = jayRootElement.refs.refName1.find((vs, coordinate) =>
                sameCoordinate(coordinate, COORDINATE_12),
            );

            expectRefToJayElement(element2, jayElements[1]);
        });
    });

    describe('single referenced component', () => {
        interface RootElementViewState {}
        interface RootElementRefs {
            refName1: ItemRef<RootElementViewState>;
        }

        let jayComponent: ItemRef<RootElementViewState>,
            jayRootElement: JayElement<RootElementViewState, RootElementRefs>,
            mockCallback;
        beforeEach(() => {
            jayRootElement = ConstructContext.withRootContext(DATA_CONTEXT, () => {
                const ref = compRef(refName1)
                return e('div', {}, [
                    childComp(
                        (props: ItemProps) => (jayComponent = Item(props)),
                        (vs) => ({ text: 'hello', dataId: 'AAA' }),
                        ref(),
                    ),
                ])
                }
            ) as JayElement<RootElementViewState, RootElementRefs>;

            mockCallback = vi.fn(() => undefined);
        });

        it('should allow using component APIs', () => {
            let summary = jayRootElement.refs.refName1.getItemSummary();
            expect(summary).toBe('item hello - false');
        });
    });

    describe('dynamic list of referenced component', () => {
        interface RootElementViewStateItem {
            id: string;
            props: ItemProps;
        }
        interface RootElementViewState {
            items: Array<RootElementViewStateItem>;
        }

        const viewState = {
            items: [
                { id: '1', props: ITEM_PROPS },
                { id: '2', props: ITEM_PROPS_2 },
                { id: '3', props: ITEM_PROPS_3 },
            ],
        };

        interface RootElementRefs {
            refName1: ComponentCollectionProxy<
                (typeof viewState.items)[0],
                ItemRef<RootElementViewState>
            >;
        }

        let jayRootElement: JayElement<RootElementViewState, RootElementRefs>, mockCallback;
        beforeEach(() => {
            jayRootElement = ConstructContext.withRootContext(viewState, () => {
                const ref1 = compCollectionRef(refName1);
                return de('div', {}, [
                    forEach(
                        (vs: typeof viewState) => vs.items,
                        (item) =>
                            childComp(
                                (props) => Item(props as ItemProps),
                                (vs: RootElementViewStateItem) => vs.props,
                                ref1(),
                            ),
                        'id',
                    ),
                ]);
            }) as JayElement<RootElementViewState, RootElementRefs>;

            mockCallback = vi.fn();
        });

        it('map should allow using component APIs and return array of callback return values', () => {
            let summaries = jayRootElement.refs.refName1.map((comp, vs, coordinate) =>
                comp.getItemSummary(),
            );
            expect(summaries).toEqual([
                'item hello - false',
                'item hi - false',
                'item hey there - false',
            ]);
        });

        it('map should provide viewState and coordinate', () => {
            let viewStates = [];
            let coordinates = [];
            jayRootElement.refs.refName1.map((comp, vs, coordinate) => {
                viewStates.push(vs);
                coordinates.push(coordinate);
            });
            expect(viewStates).toEqual(viewState.items);
            expect(coordinates).toEqual([
                ['1', 'refName1'],
                ['2', 'refName1'],
                ['3', 'refName1'],
            ]);
        });

        it('should find elements based on viewState', () => {
            let foundComp = jayRootElement.refs.refName1.find(
                (vs) => vs.id === viewState.items[1].id,
            );
            expect(foundComp.getItemSummary()).toEqual('item hi - false');
        });
    });
});
