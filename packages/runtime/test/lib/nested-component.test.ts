import {describe, it} from "@jest/globals";
import {
    ConstructContext,
    DynamicReference,
    element as e,
    JayElement, childComp
} from "../../lib/element";
import {Item, ItemComponent, ItemData} from "./comps/item";

describe('nested components', () => {
    describe('single nested component', () => {

        interface ViewState {
            staticItem: string;
        }

        interface TestRefs {
            static: ReturnType<typeof Item>,
            conditional: ReturnType<typeof Item>,
            collection: DynamicReference<number, ReturnType<typeof Item>>
        }

        interface TestElement extends JayElement<ViewState, TestRefs>, TestRefs {}

        function renderComposite(viewState: ViewState): TestElement {

            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [
                    childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'AAA'}), 'static'),
                    // conditional(vs => vs.condition, Item({text: context.currData.conditionItem}),
                    // forEach(vs => vs.items, item => Item(text: item)
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
});
