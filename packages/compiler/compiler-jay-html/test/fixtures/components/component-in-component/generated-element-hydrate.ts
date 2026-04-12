import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
    adoptElement,
} from '@jay-framework/runtime';
import { Counter } from '../counter/counter';
import { CounterViewState as CounterData } from '../counter/generated-element-main-trusted';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface ComponentInComponentElementRefs {
    counter1: CounterRef<ComponentInComponentViewState>;
    counterTwo: CounterRef<ComponentInComponentViewState>;
}

export type ComponentInComponentSlowViewState = {};
export type ComponentInComponentFastViewState = ComponentInComponentViewState;
export type ComponentInComponentInteractiveViewState = ComponentInComponentViewState;

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
export type ComponentInComponentContract = JayContract<
    ComponentInComponentViewState,
    ComponentInComponentElementRefs,
    ComponentInComponentSlowViewState,
    ComponentInComponentFastViewState,
    ComponentInComponentInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ComponentInComponentElementPreRender {
    const [refManager, [refCounter1, refCounterTwo, refAR1, refAR2, refAR3]] =
        ReferencesManager.for(options, [], [], ['counter1', 'counterTwo', 'aR1', 'aR2', 'aR3'], []);
    const render = (viewState: ComponentInComponentViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
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
