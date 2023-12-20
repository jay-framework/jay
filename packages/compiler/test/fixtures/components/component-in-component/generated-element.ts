import {
    JayElement,
    element as e,
    ConstructContext,
    childComp,
    compRef as cr,
    RenderElementOptions,
} from 'jay-runtime';
import { CounterRef } from '../counter/counter-refs';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-mainSandbox';
// @ts-expect-error Cannot find module
import { CounterViewState as CounterData } from '../counter/generated-element?jay-mainSandbox';

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

export function render(
    viewState: ComponentInComponentViewState,
    options?: RenderElementOptions,
): ComponentInComponentElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            e('div', {}, [
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
            ]),
        options,
    );
}
