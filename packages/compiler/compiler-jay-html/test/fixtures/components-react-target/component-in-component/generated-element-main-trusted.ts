import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
} from 'jay-runtime';
import { CounterComponentType } from '../counter/counter-refs';
import { Counter } from '../counter/counter';
import { CounterViewState as CounterData } from '../counter/generated-react-element';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export interface ComponentInComponentElementRefs {
    counter1: CounterComponentType<ComponentInComponentViewState>;
    counterTwo: CounterComponentType<ComponentInComponentViewState>;
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
    ComponentInComponentElementRefs,
    ComponentInComponentElementRender,
];

export function render(options?: RenderElementOptions): ComponentInComponentElementPreRender {
    const [refManager, [refCounter1, refCounterTwo, refAR1, refAR2, refAR3]] =
        ReferencesManager.for(options, [], [], ['counter1', 'counterTwo', 'aR1', 'aR2', 'aR3'], []);
    const render = (viewState: ComponentInComponentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
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
            ]),
        ) as ComponentInComponentElement;
    return [refManager.getPublicAPI() as ComponentInComponentElementRefs, render];
}
