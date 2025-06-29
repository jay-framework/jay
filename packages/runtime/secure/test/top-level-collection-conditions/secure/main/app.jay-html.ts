import {
    JayElement,
    element as e,
    ConstructContext,
    RenderElementOptions,
    dynamicElement as de,
    conditional as c,
    forEach,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from '@jay-framework/runtime';
import { Counter as CounterComponentType } from '../../regular/counter';
import { Counter } from './counter';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib/';

export interface SubCounter {
    id: string;
    initialCount: number;
}

export interface AppViewState {
    cond: boolean;
    initialCount: number;
    subCounters: Array<SubCounter>;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<
    ParentVS,
    ReturnType<typeof CounterComponentType>
>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;
export interface AppElementRefs {
    comp1: CounterRef<AppViewState>;
    comp2: CounterRefs<SubCounter>;
}

export type AppElement = JayElement<AppViewState, AppElementRefs>;
export type AppElementRender = RenderElement<AppViewState, AppElementRefs, AppElement>;
export type AppElementPreRender = [AppElementRefs, AppElementRender];

export function renderAppElement(options?: RenderElementOptions): AppElementPreRender {
    const [refManager, [comp1, comp2]] = ReferencesManager.for(
        options,
        [],
        [],
        ['comp1'],
        ['comp2'],
    );
    const render = (viewState: AppViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return mr(viewState, () =>
                de('div', {}, [
                    c(
                        (vs) => vs.cond,
                        () =>
                            secureChildComp(
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
                            return secureChildComp(
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
                ]),
            );
        }) as AppElement;
    return [refManager.getPublicAPI() as AppElementRefs, render];
}
