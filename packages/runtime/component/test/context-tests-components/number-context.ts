import { Getter, Setter } from 'jay-reactive';
import { createJayContext } from 'jay-runtime';
import { createReactiveContext, createSignal } from '../../lib';

export interface CountContext {
    count: Getter<number>;
    setCount: Setter<number>;
    inc: () => void;
}
export const COUNT_CONTEXT = createJayContext<CountContext>();
export const mkContext = () =>
    createReactiveContext(() => {
        const [count, setCount] = createSignal(12);
        const inc = () => {
            setCount((_) => _ + 1);
        };
        return { count, inc, setCount };
    });
