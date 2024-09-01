import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
} from 'jay-runtime';
import { CounterRef, CounterRefs } from '../counter/counter-refs';
import { Counter } from '../counter/counter';

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
    counter2: CounterRef<DynamicComponentInComponentViewState>;
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
        ['refCounter2'],
        ['refCounter1'],
    );
    const render = (viewState: DynamicComponentInComponentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs) => vs.nestedCounters,
                    (vs1: NestedCounter) => {
                        return childComp(
                            Counter,
                            (vs: NestedCounter) => ({ initialValue: vs.counter }),
                            refCounter1(),
                        );
                    },
                    'id',
                ),
                c(
                    (vs) => vs.condition,
                    childComp(
                        Counter,
                        (vs: DynamicComponentInComponentViewState) => ({ initialValue: vs.count1 }),
                        refCounter2(),
                    ),
                ),
            ]),
        ) as DynamicComponentInComponentElement;
    return [refManager.getPublicAPI() as DynamicComponentInComponentElementRefs, render];
}
