import { JayElement, RenderElement } from 'jay-runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxChildComp as childComp,
    sandboxForEach as forEach,
} from 'jay-secure';
import { CounterComponentType, CounterRefs } from '../counter/counter-refs';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-workerSandbox';

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
    DynamicComponentInComponentElementRefs,
    DynamicComponentInComponentElementRender,
];

export function render(): DynamicComponentInComponentElementPreRender {
    const [refManager, [refCounter2, refCounter1]] = SecureReferencesManager.forElement(
        [],
        [],
        ['counter2'],
        ['counter1'],
    );
    const render = (viewState: DynamicComponentInComponentViewState) =>
        elementBridge(viewState, refManager, () => [
            forEach(
                (vs) => vs.nestedCounters,
                'id',
                () => [
                    childComp(
                        Counter,
                        (vs: NestedCounter) => ({ initialValue: vs.counter }),
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
