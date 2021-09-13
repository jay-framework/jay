import {describe, it} from "@jest/globals";
import {
    conditional,
    ConstructContext,
    DynamicReference,
    element as e, forEach,
    JayElement, childComp
} from "../../lib/element";
import {Item, ItemData} from "./comps/item";

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

    return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
        e('div', {}, [
            childComp((props: ItemData) => Item(props), vs => ({text: vs.staticItem, dataId: 'AAA'}), context) //,
                // conditional(vs => vs.condition, Item({text: context.currData.conditionItem}),
                // forEach(vs => vs.items, item => Item(text: item)
        ], context)
    ) as TestElement;
}

describe('nested components', () => {
    it("create counter with initial value 6", () => {
        let composite = renderComposite({
            staticItem: 'hello world'
        });
        let AAA = composite.dom.querySelector('[data-id="AAA"]');
        expect(AAA.textContent).toBe('hello world - tbddoneremove');
    });


});
