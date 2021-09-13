import {describe, it} from "@jest/globals";
import {Counter} from "./comps/counter-comp";

describe('counter component', () => {
    it("create counter with initial value 6", () => {
        let counter = Counter(6);

        expect(counter.element.count.textContent).toBe('6');
    });

    it("inc the counter", () => {
        let counter = Counter(6);

        counter.element.inc.click();
        expect(counter.element.count.textContent).toBe('7');

    });

    it("inc and dec the counter", () => {
        let counter = Counter(6);

        counter.element.inc.click();
        counter.element.inc.click();
        counter.element.inc.click();
        counter.element.dec.click();
        expect(counter.element.count.textContent).toBe('8');
    });

});
