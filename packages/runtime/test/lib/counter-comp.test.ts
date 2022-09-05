import {describe, it} from "@jest/globals";
import {Counter} from "./comps/counter-comp";

describe('counter component', () => {
    it("create counter with initial value 6", () => {
        let counter = Counter(6);

        counter.element.refs.count.execNative(elem =>
          expect(elem.textContent).toBe('6'));
    });

    it("inc the counter", () => {
        let counter = Counter(6);

        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.count.execNative(elem =>
          expect(elem.textContent).toBe('7'));

    });

    it("inc and dec the counter", () => {
        let counter = Counter(6);

        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.dec.execNative(elem => elem.click());
        counter.element.refs.count.execNative(elem =>
          expect(elem.textContent).toBe('8'));
    });

});
