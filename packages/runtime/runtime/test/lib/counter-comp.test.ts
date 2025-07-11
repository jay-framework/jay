import { Counter } from './comps/counter-comp';
import '../../lib/element-test-types';

describe('counter component', () => {
    it('create counter with initial value 6', () => {
        let counter = Counter(6);

        counter.element.refs.count.exec$((elem) => expect(elem.textContent).toBe('6'));
    });

    it('inc the counter', () => {
        let counter = Counter(6);

        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.count.exec$((elem) => expect(elem.textContent).toBe('7'));
    });

    it('inc and dec the counter', () => {
        let counter = Counter(6);

        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.dec.exec$((elem) => elem.click());
        counter.element.refs.count.exec$((elem) => expect(elem.textContent).toBe('8'));
    });

    it('support component events', () => {
        let fn = vi.fn();
        let counter = Counter(6);

        counter.onChange(fn);

        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.dec.exec$((elem) => elem.click());

        expect(fn.mock.calls.length).toBe(4);
    });

    it('validate events view state and coordinate via the counter component', () => {
        let fn = vi.fn();
        let counter = Counter(6);

        counter.onChange(fn);

        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.inc.exec$((elem) => elem.click());
        counter.element.refs.dec.exec$((elem) => elem.click());

        expect(fn.mock.calls.length).toBe(4);
        expect(fn.mock.calls[0][0]).toEqual({ event: { count: 7, innerCoordinate: ['inc'] } });
        expect(fn.mock.calls[1][0]).toEqual({ event: { count: 8, innerCoordinate: ['inc'] } });
        expect(fn.mock.calls[2][0]).toEqual({ event: { count: 9, innerCoordinate: ['inc'] } });
        expect(fn.mock.calls[3][0]).toEqual({ event: { count: 8, innerCoordinate: ['dec'] } });
    });
});
