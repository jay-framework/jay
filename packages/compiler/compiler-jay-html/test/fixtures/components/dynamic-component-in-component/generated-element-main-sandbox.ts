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
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
} from '@jay-framework/runtime';
import { secureChildComp } from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-mainSandbox';

export interface NestedCounterOfDynamicComponentInComponentViewState {
    counter: number;
    id: string;
}

export interface DynamicComponentInComponentViewState {
    nestedCounters: Array<NestedCounterOfDynamicComponentInComponentViewState>;
    condition: boolean;
    count1: number;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
// @ts-ignore component type not defined because of import error above
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;

export interface DynamicComponentInComponentElementRefs {
    counter2: CounterRef<DynamicComponentInComponentViewState>;
    nestedCounters: {
        counter1: CounterRefs<NestedCounterOfDynamicComponentInComponentViewState>;
    };
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
    DynamicComponentInComponentElementRefs,
    DynamicComponentInComponentElementRender,
];
export type DynamicComponentInComponentContract = JayContract<
    DynamicComponentInComponentViewState,
    DynamicComponentInComponentElementRefs
>;

export function render(
    options?: RenderElementOptions,
): DynamicComponentInComponentElementPreRender {
    const [nestedCountersRefManager, [refCounter1]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['counter1'],
    );
    const [refManager, [refCounter2]] = ReferencesManager.for(options, [], [], ['counter2'], [], {
        nestedCounters: nestedCountersRefManager,
    });
    const render = (viewState: DynamicComponentInComponentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs: DynamicComponentInComponentViewState) => vs.nestedCounters,
                    (vs1: NestedCounterOfDynamicComponentInComponentViewState) => {
                        return secureChildComp(
                            Counter,
                            (vs1: NestedCounterOfDynamicComponentInComponentViewState) => ({
                                initialValue: vs1.counter,
                            }),
                            refCounter1(),
                        );
                    },
                    'id',
                ),
                c(
                    (vs) => vs.condition,
                    () =>
                        secureChildComp(
                            Counter,
                            (vs: DynamicComponentInComponentViewState) => ({
                                initialValue: vs.count1,
                            }),
                            refCounter2(),
                        ),
                ),
            ]),
        ) as DynamicComponentInComponentElement;
    return [refManager.getPublicAPI() as DynamicComponentInComponentElementRefs, render];
}
