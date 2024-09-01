import { JayElement, RenderElement } from 'jay-runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxChildComp as childComp,
} from 'jay-secure';
import { CounterRef } from '../counter/counter-refs';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-workerSandbox';
// @ts-expect-error Cannot find module
import { CounterViewState as CounterData } from '../counter/generated-element-main-trusted?jay-workerSandbox';

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
export type ComponentInComponentElementRender = RenderElement<
    ComponentInComponentViewState,
    ComponentInComponentElementRefs,
    ComponentInComponentElement
>;
export type ComponentInComponentElementPreRender = [
    refs: ComponentInComponentElementRefs,
    ComponentInComponentElementRender,
];

export function render(): ComponentInComponentElementPreRender {
    const [refManager, [refCounter1, refCounterTwo, refAR1, refAR2, refAR3]] =
        SecureReferencesManager.forElement(
            [],
            [],
            ['refCounter1', 'refCounterTwo', 'refAR1', 'refAR2', 'refAR3'],
            [],
        );
    const render = (viewState: ComponentInComponentViewState) =>
        elementBridge(viewState, refManager, () => [
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count1 }),
            refCounter1(),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count2 }),
            refCounterTwo(),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count3 }),
            refAR1(),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: vs.count4?.count }),
            refAR2(),
        ),
        childComp(
            Counter,
            (vs: ComponentInComponentViewState) => ({ initialValue: 25 }),
            refAR3(),
        ),
        ]) as ComponentInComponentElement;
    return [refManager.getPublicAPI() as ComponentInComponentElementRefs, render];
}
