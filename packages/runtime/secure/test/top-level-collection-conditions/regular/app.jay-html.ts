import {
    JayElement,
    element as e,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from 'jay-runtime';
import { Counter } from './counter';

export interface SubCounter {
    id: string;
    initialCount: number;
}

export interface AppViewState {
    cond: boolean;
    initialCount: number;
    subCounters: Array<SubCounter>;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;
export interface AppElementRefs {
    comp1: CounterRef<AppViewState>;
    comp2: CounterRefs<SubCounter>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function render(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1, comp2]] = ReferencesManager.for(
        options,
        [],
        [],
        ['comp1'],
        ['comp2'],
    );
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return de('div', {}, [
                c(
                    (vs) => vs.cond,
                    () =>
                        childComp(
                            Counter,
                            (vs: AppViewState) => ({
                                title: 'conditional counter',
                                initialCount: vs.initialCount,
                                id: 'cond',
                            }),
                            comp1(),
                        ),
                ),
                forEach(
                    (vs) => vs.subCounters,
                    (vs1: SubCounter) => {
                        return childComp(
                            Counter,
                            (vs: SubCounter) => ({
                                title: `collection counter ${vs.id}`,
                                initialCount: vs.initialCount,
                                id: vs.id,
                            }),
                            comp2(),
                        );
                    },
                    'id',
                ),
            ]);
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
