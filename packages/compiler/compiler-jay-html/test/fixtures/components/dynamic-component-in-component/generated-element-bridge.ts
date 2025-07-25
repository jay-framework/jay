import {
    JayElement,
    RenderElement,
    MapEventEmitterViewState,
    OnlyEventEmitters,
    ComponentCollectionProxy,
    JayContract,
} from '@jay-framework/runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxChildComp as childComp,
    sandboxForEach as forEach,
} from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-workerSandbox';

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

export function render(): DynamicComponentInComponentElementPreRender {
    const [nestedCountersRefManager, [refCounter1]] = SecureReferencesManager.forElement(
        [],
        [],
        [],
        ['counter1'],
    );
    const [refManager, [refCounter2]] = SecureReferencesManager.forElement(
        [],
        [],
        ['counter2'],
        [],
        {
            nestedCounters: nestedCountersRefManager,
        },
    );
    const render = (viewState: DynamicComponentInComponentViewState) =>
        elementBridge(viewState, refManager, () => [
            forEach(
                (vs: DynamicComponentInComponentViewState) => vs.nestedCounters,
                'id',
                () => [
                    childComp(
                        Counter,
                        (vs1: NestedCounterOfDynamicComponentInComponentViewState) => ({
                            initialValue: vs1.counter,
                        }),
                        refCounter1(),
                    ),
                ],
            ),
            childComp(
                Counter,
                (vs: DynamicComponentInComponentViewState) => ({ initialValue: vs.count1 }),
                refCounter2(),
            ),
        ]) as DynamicComponentInComponentElement;
    return [refManager.getPublicAPI() as DynamicComponentInComponentElementRefs, render];
}
