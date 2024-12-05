import { GetterMark, mkReactive, Reactive, SetterMark } from 'jay-reactive';
import { withContext } from 'jay-runtime';
import { CONTEXT_CREATION_CONTEXT } from './component-contexts';

export const CONTEXT_REACTIVE_SYMBOL_CONTEXT = Symbol('context-reactive');
function newContextProxy<T extends object>(reactive: Reactive, context: T): T {
    const wrapped = new Map<Function, Function>();
    const wrap = (target: Function) => {
        if (!wrapped.has(target))
            wrapped.set(target, (...args) =>
                reactive.batchReactions(() => target.apply(context, args)),
            );

        return wrapped.get(target);
    };

    return new Proxy(context, {
        get(target: T, p: string | symbol, receiver: any): any {
            if (p === CONTEXT_REACTIVE_SYMBOL_CONTEXT) return reactive;
            else if (
                !target[p][GetterMark] &&
                !target[p][SetterMark] &&
                typeof target[p] === 'function'
            )
                return wrap(target[p]);
            else return target[p];
        },
    }) as T;
}

export function createReactiveContext<T extends object>(mkContext: () => T): T {
    const reactive = mkReactive('ctx', mkContext.name);
    const context = withContext(
        CONTEXT_CREATION_CONTEXT,
        { reactive, mountedSignal: reactive.createSignal(true), provideContexts: [] },
        mkContext,
    );
    return newContextProxy(reactive, context);
}
