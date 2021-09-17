import {describe, it} from "@jest/globals";
import {
    conditional,
    ConstructContext,
    DynamicReference,
    element as e, forEach,
    JayElement, childComp
} from "../../lib/element";
import {Item, ItemData} from "./comps/item";

describe('nested components', () => {
    describe('single nested component', () => {

        interface ViewState {
            staticItem: string;
            // condition: boolean;
            // conditionItem: string;
            // items: Array<string>;
        }

        interface TestElement extends JayElement<ViewState> {
            static: HTMLElement,
            conditional: HTMLElement,
            collection: DynamicReference<number>
        }

        function renderComposite(viewState: ViewState): TestElement {

            return ConstructContext.withRootContext(viewState, () =>
                e('div', {}, [
                    childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'AAA'})) //,
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

        it("handle events on nested component", () => {
            let composite = renderComposite({
                staticItem: 'hello world'
            });
            // todo get reference to the nested component
            // let button = composite.dom.querySelector('[data-id="AAA"] span');
            // expect(button.textContent).toBe('an updated text - tbd');
        });
    })
});
