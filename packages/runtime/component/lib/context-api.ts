import { GetterMark, mkReactive, Reactive, SetterMark } from '@jay-framework/reactive';
import { ContextMarker, registerGlobalContext, withContext } from '@jay-framework/runtime';
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

/**
 * Creates a reactive context and registers it globally.
 * Use this in `withClient` initialization to create reactive global contexts.
 *
 * @param marker - The context marker created with createJayContext()
 * @param mkContext - Factory function that creates the context (can use createSignal, etc.)
 * @returns The created context (for immediate use in init)
 *
 * @example
 * ```typescript
 * export const init = makeJayInit()
 *   .withClient(async () => {
 *     const ctx = registerReactiveGlobalContext(MY_CONTEXT, () => {
 *       const [count, setCount] = createSignal(0);
 *       return {
 *         count,
 *         increment: () => setCount(n => n + 1),
 *         async init() { await loadData(); },
 *       };
 *     });
 *     await ctx.init();
 *   });
 * ```
 */
export function registerReactiveGlobalContext<T extends object>(
    marker: ContextMarker<T>,
    mkContext: () => T,
): T {
    const context = createReactiveContext(mkContext);
    registerGlobalContext(marker, context);
    return context;
}
