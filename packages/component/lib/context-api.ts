import { GetterMark, Reactive, SetterMark } from 'jay-reactive';
import { withContext } from 'jay-runtime';
import { CONTEXT_CREATION_CONTEXT } from './component-contexts';

function newContextProxy<T extends object>(reactive: Reactive, context: T): T {
    const wrapped = new Map<Function, Function>();
    const wrap =
        (target: Function) =>
        (...args) => {
            if (!wrapped.has(target))
                wrapped.set(
                    target,
                    reactive.batchReactions(() => target.apply(context, args)),
                );
            return wrapped.get(target);
        };

    return new Proxy(context, {
        get(target: T, p: string | symbol, receiver: any): any {
            if (!target[p][GetterMark] && !target[p][SetterMark] && typeof target[p] === 'function')
                return wrap(target[p]);
            else return target[p];
        },
    }) as T;
}

export function createReactiveContext<T extends object>(mkContext: () => T): T {
    const reactive = new Reactive();
    const context = withContext(
        CONTEXT_CREATION_CONTEXT,
        { reactive, mounts: [], unmounts: [], provideContexts: [] },
        mkContext,
    );
    return newContextProxy(reactive, context);
}
