import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    resolved,
    pending,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface A1OfAsyncArraysViewState {
    s3: string;
    n3: number;
}

export interface Pa1OfAsyncArraysViewState {
    ps3: string;
    pn3: number;
}

export interface AsyncArraysViewState {
    a1: Array<A1OfAsyncArraysViewState>;
    pa1: Promise<Array<Pa1OfAsyncArraysViewState>>;
}

export interface AsyncArraysElementRefs {}

export type AsyncArraysSlowViewState = {};
export type AsyncArraysFastViewState = {};
export type AsyncArraysInteractiveViewState = AsyncArraysViewState;

export type AsyncArraysElement = JayElement<AsyncArraysViewState, AsyncArraysElementRefs>;
export type AsyncArraysElementRender = RenderElement<
    AsyncArraysViewState,
    AsyncArraysElementRefs,
    AsyncArraysElement
>;
export type AsyncArraysElementPreRender = [AsyncArraysElementRefs, AsyncArraysElementRender];
export type AsyncArraysContract = JayContract<
    AsyncArraysViewState,
    AsyncArraysElementRefs,
    AsyncArraysSlowViewState,
    AsyncArraysFastViewState,
    AsyncArraysInteractiveViewState
>;

export function render(options?: RenderElementOptions): AsyncArraysElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AsyncArraysViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs: AsyncArraysViewState) => vs.a1,
                    (vs1: A1OfAsyncArraysViewState) => {
                        return e('div', {}, [
                            e('span', {}, [dt((vs1) => vs1.s3)]),
                            e('span', {}, [dt((vs1) => vs1.n3)]),
                        ]);
                    },
                    's3',
                ),
                pending(
                    (vs) => vs.pa1,
                    () => e('span', {}, ['still loading']),
                ),
                resolved<AsyncArraysViewState, Array<Pa1OfAsyncArraysViewState>>(
                    (vs) => vs.pa1,
                    () =>
                        de('div', {}, [
                            forEach(
                                (vs1: Array<Pa1OfAsyncArraysViewState>) => vs1,
                                (vs2: Pa1OfAsyncArraysViewState) => {
                                    return e('div', {}, [
                                        e('span', {}, [dt((vs2) => vs2.ps3)]),
                                        e('span', {}, [dt((vs2) => vs2.pn3)]),
                                    ]);
                                },
                                'ps3',
                            ),
                        ]),
                ),
            ]),
        ) as AsyncArraysElement;
    return [refManager.getPublicAPI() as AsyncArraysElementRefs, render];
}
