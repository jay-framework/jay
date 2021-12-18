import {describe, it} from "@jest/globals";
import {
    ConstructContext,
    DynamicReference,
    element as e,
    dynamicElement as de,
    JayElement, childComp, forEach, conditional
} from "../../lib/element";
import {Item, ItemData} from "./comps/item";

describe('nested components', () => {
    describe('single nested component', () => {

        interface ViewState {
            staticItem: string;
        }

        interface TestRefs {
            static: ReturnType<typeof Item>,
            // conditional: ReturnType<typeof Item>,
            // collection: DynamicReference<number, ReturnType<typeof Item>>
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {

            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [
                    childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'AAA'}), 'static'),
                    // conditional(vs => vs.condition,
                    //     childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'condition'}), 'static')),
                    // forEach(vs => vs.items, item => childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'condition'}), 'static')
                ])
            ) as TestElement;
        }

        it("create an item nested component with hello world", () => {
            let composite = renderComposite({
                staticItem: 'hello world'
            });
            let span = composite.dom.querySelector('[data-id="AAA"] span');
            expect(span.textContent).toBe('hello world - tbd');
        });

        it("update a nested component", () => {
            let composite = renderComposite({
                staticItem: 'hello world'
            });
            composite.update({
                staticItem: 'an updated text'
            })
            let span = composite.dom.querySelector('[data-id="AAA"] span');
            expect(span.textContent).toBe('an updated text - tbd');
        });

        it("have a reference to a nested component", () => {
            let composite = renderComposite({
                staticItem: 'hello world'
            });
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(composite.refs.static.element.dom.attributes['data-id'].value).toBe('AAA');
        });

        it("handle events on nested component", () => {
            let handler = jest.fn();
            let composite = renderComposite({
                staticItem: 'hello world'
            });
            composite.refs.static.onremove = handler;

            let button = composite.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;
            button.click();
            expect(handler.mock.calls.length).toBe(1);
        });
    })

    describe('conditional nested component', () => {
        interface ViewState {
            staticItem: string;
            condition: boolean;
        }

        interface TestRefs {
            conditional: ReturnType<typeof Item>,
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {

            return ConstructContext.withRootContext(viewState, () =>
                de('div', {}, [
                    conditional(vs => vs.condition,
                        childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'condition'}), 'conditional'))
                    // forEach(vs => vs.items, item => childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'condition'}), 'static')
                ])
            ) as TestElement;
        }

        it("have a reference to a nested component", () => {
            let composite = renderComposite({
                staticItem: 'hello world',
                condition: true
            });
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(composite.refs.conditional.element.dom.attributes['data-id'].value).toBe('condition');
        });

    });

    describe('collection nested component', () => {
        interface DataItem {
            id: string,
            value: string
        }
        interface ViewState {
            items: DataItem[];
        }

        interface TestRefs {
            collection: DynamicReference<DataItem, ReturnType<typeof Item>>
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {

            return ConstructContext.withRootContext(viewState, () =>
                de('div', {}, [
                    forEach(vs => vs.items,
                        item => childComp(
                            (props: ItemData) => Item(props),
                            dataItem => ({text: dataItem.value, dataId: dataItem.id}), 'collection'),
                        'id')
                ])
            ) as TestElement;
        }

        it("have a reference to a nested component", () => {
            let viewState = {
                items: [{id: 'A', value: 'one'}, {id: 'B', value: 'two'}]
            };
            let composite = renderComposite(viewState);
            // validate we actually have a reference to the nested component by finding the data id on the nested component dom
            expect(composite.refs.collection.filter(item => item.id === 'A')
                .element.dom.attributes['data-id'].value).toBe('A');
        });

        it("should update nested components", () => {
            let viewState = {
                items: [{id: 'A', value: 'eleven'}, {id: 'B', value: 'twelves'}]
            };
            let composite = renderComposite(viewState);

            expect(composite.refs.collection.filter(item => item.id === 'A')
                .element.dom.querySelector('[data-id="A"] span').textContent).toBe('eleven - tbd');
        });

        it("should process nested component internal events", () => {
            let viewState = {
                items: [{id: 'A', value: 'eleven'}, {id: 'B', value: 'twelves'}]
            };
            let composite = renderComposite(viewState);

            let doneButton = composite.refs.collection.filter(item => item.id === 'A')
                .element.dom.querySelector('button[data-id="done"]') as HTMLButtonElement;

            doneButton.click();

            expect(composite.refs.collection.filter(item => item.id === 'A')
                .element.dom.querySelector('[data-id="A"] span').textContent).toBe('eleven - done');
        });

        it("should process nested component external events", () => {
            let fn = jest.fn();
            let viewState = {
                items: [{id: 'A', value: 'eleven'}, {id: 'B', value: 'twelves'}]
            };
            let composite = renderComposite(viewState);

            let removeButton = composite.refs.collection.filter(item => item.id === 'A')
                .element.dom.querySelector('button[data-id="remove"]') as HTMLButtonElement;

            composite.refs.collection.onremove = fn;

            removeButton.click();

            expect(fn.mock.calls.length).toBe(1);
            expect(fn.mock.calls[0][1]).toBe(viewState.items[0]);
        });
    });
});
