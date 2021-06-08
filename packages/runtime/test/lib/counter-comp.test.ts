import {describe, it} from "@jest/globals";
import {dynamicText as dt, element as e, JayElement,} from "../../lib/element";
import {ReferenceAPI, ReferencesManager} from "../../lib/node-reference";

interface ViewState {
    count: number
}

interface CounterElement extends JayElement<ViewState> {
    inc: ReferenceAPI<ViewState>,
    dec: ReferenceAPI<ViewState>,
    count: ReferenceAPI<ViewState>
}

function renderCounter(viewState: ViewState): CounterElement {
    let rm = new ReferencesManager()
    let el = e('div', {}, [
        e('div', {ref: 'dec'}, ['-'], viewState, rm),
        e('div', {ref: 'count'}, [dt(viewState, vs => vs.count)], viewState, rm),
        e('div', {ref: 'inc'}, ['+'], viewState, rm)
    ]);
    el = rm.applyToElement(el);
    return el as CounterElement;
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

        expect(counter.element.count.one().dom.textContent).toBe('6');
    });

    it("inc the counter", () => {
        let counter = Counter(6);

        counter.element.inc.one().dom.click();
        expect(counter.element.count.one().dom.textContent).toBe('7');

    });

    it("inc and dec the counter", () => {
        let counter = Counter(6);

        counter.element.inc.one().dom.click();
        counter.element.inc.one().dom.click();
        counter.element.inc.one().dom.click();
        counter.element.dec.one().dom.click();
        expect(counter.element.count.one().dom.textContent).toBe('8');
    });

});
