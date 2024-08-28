import {
    ConstructContext,
    element as e,
    dynamicElement as de,
    JayElement,
    childComp,
    forEach,
    conditional, ReferencesManager,
} from '../../lib/index';
import '../../lib/element-test-types';
import { Item, ItemProps } from './comps/item';
import {ItemComponentType, ItemRefs} from './comps/item-refs';

describe('nested components', () => {
    describe('single nested component', () => {
        interface ViewState {
            staticItem: string;
        }

        interface TestRefs {
            staticComponent: ItemComponentType<ViewState>;
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {
            let [refManager, [staticComponent]] = ReferencesManager.for({}, [], [], ['staticComponent'], []);
            return ConstructContext.withRootContext(viewState, refManager, () => {
                return e('div', {}, [
                    childComp(
                        (props: ItemProps) => Item(props),
                        (vs) => ({ text: vs.staticItem, dataId: 'AAA' }),
                        staticComponent(),
                    ),
                ])},
            ) as TestElement;
        }

        it('create an item nested component with hello world', () => {
            let composite = renderComposite({
                staticItem: 'hello world',
            });
            let span = composite.dom.querySelector('[data-id="AAA"] span');
            expect(span.textContent).toBe('hello world - tbd');
        });

        it('update a nested component', () => {
            let composite = renderComposite({
                staticItem: 'hello world',
            });
            composite.update({
                staticItem: 'an updated text',
            });
            let span = composite.dom.querySelector('[data-id="AAA"] span');
            expect(span.textContent).toBe('an updated text - tbd');
        });

        it('have a reference to a nested component', () => {
            let composite = renderComposite({
                staticItem: 'hello world',
            });
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(composite.refs.staticComponent.element.dom.attributes['data-id'].value).toBe(
                'AAA',
            );
        });

        it('handle events on nested component', () => {
            let handler = vi.fn();
            let composite = renderComposite({
                staticItem: 'hello world',
            });
            composite.refs.staticComponent.onremove(handler);

            let button = composite.dom.querySelector(
                'button[data-id="remove"]',
            ) as HTMLButtonElement;
            button.click();
            expect(handler.mock.calls.length).toBe(1);
        });
    });

    describe('conditional nested component', () => {
        interface ViewState {
            staticItem: string;
            condition: boolean;
        }

        interface TestRefs {
            conditional: ItemComponentType<ViewState>;
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {
            let [refManager, [condRef]] = ReferencesManager.for({}, [], [], ['conditional'], []);
            return ConstructContext.withRootContext(viewState, refManager,() => {
                return de('div', {}, [
                    conditional(
                        (vs) => vs.condition,
                        childComp(
                            (props: ItemProps) => Item(props),
                            (vs) => ({ text: vs.staticItem, dataId: 'condition' }),
                            condRef(),
                        ),
                    ),
                ])},
            ) as TestElement;
        }

        it('have a reference to a nested conditional component', () => {
            let composite = renderComposite({
                staticItem: 'hello world',
                condition: true,
            });
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(composite.refs.conditional.element.dom.attributes['data-id'].value).toBe(
                'condition',
            );
        });

        it('have a reference to a nested conditional component 2', () => {
            let composite = renderComposite({
                staticItem: 'hello world',
                condition: false,
            });
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(composite.refs.conditional.element.dom.attributes['data-id'].value).toBe(
                'condition',
            );
        });
    });

    describe('collection nested component', () => {
        interface DataItem {
            id: string;
            value: string;
        }
        interface ViewState {
            items: DataItem[];
        }

        interface TestRefs {
            forEachOfComponents: ItemRefs<DataItem>;
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {
            let [refManager, [ref]] = ReferencesManager.for({}, [], [], [], ['forEachOfComponents']);
            return ConstructContext.withRootContext(viewState, refManager,() => {
                return de('div', {}, [
                    forEach(
                        (vs: ViewState) => vs.items,
                        (item) =>
                            childComp(
                                (props: ItemProps) => Item(props),
                                (dataItem: DataItem) => ({
                                    text: dataItem.value,
                                    dataId: dataItem.id,
                                }),
                                ref(),
                            ),
                        'id',
                    ),
                ]);
            }) as TestElement;
        }

        it('have a reference to a nested component', () => {
            let viewState = {
                items: [
                    { id: 'A', value: 'one' },
                    { id: 'B', value: 'two' },
                ],
            };
            let composite = renderComposite(viewState);
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(
                composite.refs.forEachOfComponents.find((item) => item.id === 'A').element.dom
                    .attributes['data-id'].value,
            ).toBe('A');
        });

        it('should update nested components', () => {
            let viewState = {
                items: [
                    { id: 'A', value: 'eleven' },
                    { id: 'B', value: 'twelves' },
                ],
            };
            let composite = renderComposite(viewState);

            expect(
                composite.refs.forEachOfComponents
                    .find((item) => item.id === 'A')
                    .element.dom.querySelector('[data-id="A"] span').textContent,
            ).toBe('eleven - tbd');
        });

        it('should process nested component internal events', () => {
            let viewState = {
                items: [
                    { id: 'A', value: 'eleven' },
                    { id: 'B', value: 'twelves' },
                ],
            };
            let composite = renderComposite(viewState);

            let doneButton = composite.refs.forEachOfComponents
                .find((item) => item.id === 'A')
                .element.dom.querySelector('button[data-id="done"]') as HTMLButtonElement;

            doneButton.click();

            expect(
                composite.refs.forEachOfComponents
                    .find((item) => item.id === 'A')
                    .element.dom.querySelector('[data-id="A"] span').textContent,
            ).toBe('eleven - done');
        });

        it('should process nested component external events', () => {
            let fn = vi.fn();
            let viewState = {
                items: [
                    { id: 'A', value: 'eleven' },
                    { id: 'B', value: 'twelves' },
                ],
            };
            let composite = renderComposite(viewState);

            let removeButton = composite.refs.forEachOfComponents
                .find((item) => item.id === 'A')
                .element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;

            composite.refs.forEachOfComponents.onremove(fn);

            removeButton.click();

            expect(fn.mock.calls.length).toBe(1);
            expect(fn.mock.calls[0][0]).toEqual({
                event: 'item eleven - false is removed',
                coordinate: ['A', 'forEachOfComponents'],
                viewState: viewState.items[0],
            });
        });
    });
});
