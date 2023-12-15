import { JayElement } from 'jay-runtime';
import { elementBridge, sandboxChildComp as childComp, compRef as cr } from 'jay-secure';
import { CounterRef } from '../counter/counter-refs';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-workerSandbox';
// @ts-expect-error Cannot find module
import { CounterViewState as CounterData } from '../counter/generated-element?jay-workerSandbox';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export interface ComponentInComponentElementRefs {
    counter1: CounterRef<ComponentInComponentViewState>;
    counterTwo: CounterRef<ComponentInComponentViewState>;
}

export type ComponentInComponentElement = JayElement<
    ComponentInComponentViewState,
    ComponentInComponentElementRefs
>;

export function render(viewState: ComponentInComponentViewState): ComponentInComponentElement {
    return elementBridge(viewState, () => [
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count1 }),
            cr('counter1'),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count2 }),
            cr('counterTwo'),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count3 }),
            cr('aR1'),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count4?.count }),
            cr('aR2'),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: 25 }),
            cr('aR3'),
        ),
    ]);
}
