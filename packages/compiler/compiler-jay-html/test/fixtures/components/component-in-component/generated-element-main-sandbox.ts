import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
} from '@jay-framework/runtime';
import { secureChildComp } from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { Counter } from '../counter/counter?jay-mainSandbox';
// @ts-expect-error Cannot find module
import { CounterViewState as CounterData } from '../counter/generated-element-main-trusted?jay-mainSandbox';

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
    ComponentInComponentElementRefs
>;

export function render(options?: RenderElementOptions): ComponentInComponentElementPreRender {
    const [refManager, [refCounter1, refCounterTwo, refAR1, refAR2, refAR3]] =
        ReferencesManager.for(options, [], [], ['counter1', 'counterTwo', 'aR1', 'aR2', 'aR3'], []);
    const render = (viewState: ComponentInComponentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                secureChildComp(
                    Counter,
                    (vs: ComponentInComponentViewState) => ({ initialValue: vs.count1 }),
                    refCounter1(),
                ),
                secureChildComp(
                    Counter,
                    (vs: ComponentInComponentViewState) => ({ initialValue: vs.count2 }),
                    refCounterTwo(),
                ),
                secureChildComp(
                    Counter,
                    (vs: ComponentInComponentViewState) => ({ initialValue: vs.count3 }),
                    refAR1(),
                ),
                secureChildComp(
                    Counter,
                    (vs: ComponentInComponentViewState) => ({ initialValue: vs.count4?.count }),
                    refAR2(),
                ),
                secureChildComp(
                    Counter,
                    (vs: ComponentInComponentViewState) => ({ initialValue: 25 }),
                    refAR3(),
                ),
            ]),
        ) as ComponentInComponentElement;
    return [refManager.getPublicAPI() as ComponentInComponentElementRefs, render];
}
