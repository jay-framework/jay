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

    it("support component events", () => {
        let fn = jest.fn();
        let counter = Counter(6);

        counter.onChange(fn);

        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.inc.execNative(elem => elem.click());
        counter.element.refs.dec.execNative(elem => elem.click());

        expect(fn.mock.calls.length).toBe(4)
        expect(fn.mock.calls[0][0]).toBe(7)
        expect(fn.mock.calls[1][0]).toBe(8)
        expect(fn.mock.calls[2][0]).toBe(9)
        expect(fn.mock.calls[3][0]).toBe(8)
    });

});
