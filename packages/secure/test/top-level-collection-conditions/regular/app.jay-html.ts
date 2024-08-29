import {
    JayElement,
    element as e,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions, RenderElement, ReferencesManager,
} from 'jay-runtime';
import {CounterComponentType, CounterRefs} from './counter-refs';
import { Counter } from './counter';

export interface Counter {
    id: string;
    initialCount: number;
}

export interface AppViewState {
    cond: boolean;
    initialCount: number;
    counters: Array<Counter>;
}

export interface AppElementRefs {
    comp1: CounterComponentType<AppViewState>;
    comp2: CounterRefs<Counter>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>
export type AppElementPreRender = [refs: AppElementRefs, AppElementRender]

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1, comp2]] =
        ReferencesManager.for(options, [], [], ['comp1'], ['comp2']);
    const render = (viewState: AppViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => {
            return de('div', {}, [
                c(
                    (vs) => vs.cond,
                    childComp(
                        Counter,
                        (vs: AppViewState) => ({
                            title: 'conditional counter',
                            initialCount: vs.initialCount,
                            id: 'cond',
                        }),
                        comp1(),
                    ),
                ),
                forEach(
                    (vs) => vs.counters,
                    (vs1: Counter) => {
                        return childComp(
                            Counter,
                            (vs: Counter) => ({
                                title: `collection counter ${vs.id}`,
                                initialCount: vs.initialCount,
                                id: vs.id,
                            }),
                            comp2(),
                        );
                    },
                    'id',
                ),
            ]);
        },
    ) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render]
}
