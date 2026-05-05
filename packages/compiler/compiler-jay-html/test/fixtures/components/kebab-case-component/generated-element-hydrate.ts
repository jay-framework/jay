import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';
import { Counter as myCounter } from '../counter/counter';

export interface KebabCaseComponentViewState {
    count: number;
}

export type myCounterRef<ParentVS> = MapEventEmitterViewState<
    ParentVS,
    ReturnType<typeof myCounter>
>;
export interface KebabCaseComponentElementRefs {
    counter1: myCounterRef<KebabCaseComponentViewState>;
}

export type KebabCaseComponentSlowViewState = {};
export type KebabCaseComponentFastViewState = KebabCaseComponentViewState;
export type KebabCaseComponentInteractiveViewState = KebabCaseComponentViewState;

export type KebabCaseComponentElement = JayElement<
    KebabCaseComponentViewState,
    KebabCaseComponentElementRefs
>;
export type KebabCaseComponentElementRender = RenderElement<
    KebabCaseComponentViewState,
    KebabCaseComponentElementRefs,
    KebabCaseComponentElement
>;
export type KebabCaseComponentElementPreRender = [
    KebabCaseComponentElementRefs,
    KebabCaseComponentElementRender,
];
export type KebabCaseComponentContract = JayContract<
    KebabCaseComponentViewState,
    KebabCaseComponentElementRefs,
    KebabCaseComponentSlowViewState,
    KebabCaseComponentFastViewState,
    KebabCaseComponentInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): KebabCaseComponentElementPreRender {
    const [refManager, [refCounter1]] = ReferencesManager.for(options, [], [], ['counter1'], []);
    const render = (viewState: KebabCaseComponentViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.count),
                childComp(
                    myCounter,
                    (vs: KebabCaseComponentViewState) => ({ initialValue: vs.count }),
                    refCounter1(),
                ),
            ]),
        ) as KebabCaseComponentElement;
    return [refManager.getPublicAPI() as KebabCaseComponentElementRefs, render];
}
