import {describe, it} from "@jest/globals";
import {ConstructContext, dynamicText as dt, element as e, JayElement,} from "../../lib/element";
import {ReferenceAPI} from "../../lib/node-reference";

interface ViewState {
    count: number
}

interface CounterElement extends JayElement<ViewState> {
    inc: ReferenceAPI<ViewState>,
    dec: ReferenceAPI<ViewState>,
    count: ReferenceAPI<ViewState>
}

function renderCounter(viewState: ViewState): CounterElement {

    return ConstructContext.withRootContext(viewState, (context: ConstructContext<[ViewState]>) =>
        e('div', {}, [
            e('div', {ref: 'dec'}, ['-'], context),
            e('div', {ref: 'count'}, [dt(context, vs => vs.count)], context),
            e('div', {ref: 'inc'}, ['+'], context)],
            context)
    ) as CounterElement;
}

interface JayComponent<T, R, E extends JayElement<R>> {
    element: E,
    update: (t: T) => void
}

interface CounterData {
}

interface CounterComponent extends JayComponent<CounterData, ViewState, CounterElement> {

}

function Counter(initialValue: number): CounterComponent {
    let jayElement = renderCounter({count: initialValue});
    let count = initialValue;

    jayElement.inc.onclick(() => {
        count += 1;
        jayElement.update({count});
    })

    jayElement.dec.onclick(() => {
        count -= 1;
        jayElement.update({count});
    })

    return {
        element: jayElement,
        update: () => {}
    }
}

describe('counter component', () => {
    it("create counter with initial value 6", () => {
        let counter = Counter(6);

        expect(counter.element.count.one().textContent).toBe('6');
    });

    it("inc the counter", () => {
        let counter = Counter(6);

        counter.element.inc.one().click();
        expect(counter.element.count.one().textContent).toBe('7');

    });

    it("inc and dec the counter", () => {
        let counter = Counter(6);

        counter.element.inc.one().click();
        counter.element.inc.one().click();
        counter.element.inc.one().click();
        counter.element.dec.one().click();
        expect(counter.element.count.one().textContent).toBe('8');
    });

});
