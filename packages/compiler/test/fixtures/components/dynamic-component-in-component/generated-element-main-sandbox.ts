import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import { secureChildComp } from 'jay-secure';
import { CounterComponentType, CounterRefs } from '../counter/counter-refs';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-mainSandbox';

export interface NestedCounter {
    counter: number;
    id: string;
}

export interface DynamicComponentInComponentViewState {
    nestedCounters: Array<NestedCounter>;
    condition: boolean;
    count1: number;
}

export interface DynamicComponentInComponentElementRefs {
    counter1: CounterRefs<NestedCounter>;
    counter2: CounterComponentType<DynamicComponentInComponentViewState>;
}

export type DynamicComponentInComponentElement = JayElement<
    DynamicComponentInComponentViewState,
    DynamicComponentInComponentElementRefs
>;
export type DynamicComponentInComponentElementRender = RenderElement<
    DynamicComponentInComponentViewState,
    DynamicComponentInComponentElementRefs,
    DynamicComponentInComponentElement
>;
export type DynamicComponentInComponentElementPreRender = [
    refs: DynamicComponentInComponentElementRefs,
    DynamicComponentInComponentElementRender,
];

export function render(
    options?: RenderElementOptions,
): DynamicComponentInComponentElementPreRender {
    const [refManager, [refCounter2, refCounter1]] = ReferencesManager.for(
        options,
        [],
        [],
        ['counter2'],
        ['counter1'],
    );
    const render = (viewState: DynamicComponentInComponentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs) => vs.nestedCounters,
                    (vs1: NestedCounter) => {
                        return secureChildComp(
                            Counter,
                            (vs: NestedCounter) => ({ initialValue: vs.counter }),
                            refCounter1(),
                        );
                    },
                    'id',
                ),
                c(
                    (vs) => vs.condition,
                    secureChildComp(
                        Counter,
                        (vs: DynamicComponentInComponentViewState) => ({ initialValue: vs.count1 }),
                        refCounter2(),
                    ),
                ),
            ]),
        ) as DynamicComponentInComponentElement;
    return [refManager.getPublicAPI() as DynamicComponentInComponentElementRefs, render];
}
