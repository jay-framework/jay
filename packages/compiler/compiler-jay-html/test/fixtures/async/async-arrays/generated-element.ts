import {
    JayElement,
    element as e,
    dynamicElement as de,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract, resolved, pending, rejected, forEach,
} from '@jay-framework/runtime';

export interface A1OfAsyncArraysViewState {
    s3: string
    n3: number
}

export interface Pa1OfAsyncArraysViewState {
    ps3: string
    pn3: number
}

export interface AsyncArraysViewState {
    a1: Array<A1OfAsyncArraysViewState>;
    pa1: Promise<Array<Pa1OfAsyncArraysViewState>>;
}

export interface AsyncArraysElementRefs {}

export type AsyncArraysElement = JayElement<AsyncArraysViewState, AsyncArraysElementRefs>;
export type AsyncArraysElementRender = RenderElement<
    AsyncArraysViewState,
    AsyncArraysElementRefs,
    AsyncArraysElement
>;
export type AsyncArraysElementPreRender = [AsyncArraysElementRefs, AsyncArraysElementRender];
export type AsyncArraysContract = JayContract<AsyncArraysViewState, AsyncArraysElementRefs>;

export function render(options?: RenderElementOptions): AsyncArraysElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AsyncArraysViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs: AsyncArraysViewState) => vs.a1,
                    () =>
                        e('div', {}, [
                            e('span', {}, [dt((vs) => vs.s3)]),
                            e('span', {}, [dt((vs) => vs.n3)]),
                        ]),
                    "s3"),
                pending(vs => vs.pa1, () => "Still loading"),
                resolved(vs => vs.pa1, () =>
                    de('div', {}, [
                        forEach(
                            (vs: Array<Pa1OfAsyncArraysViewState>) => vs,
                            () =>
                                e('div', {}, [
                                    e('span', {}, [dt((vs: Pa1OfAsyncArraysViewState) => vs.ps3)]),
                                    e('span', {}, [dt((vs: Pa1OfAsyncArraysViewState) => vs.pn3)]),
                                ]),
                            'ps3')
                    ])
                ),
            ]),
        ) as AsyncArraysElement;
    return [refManager.getPublicAPI() as AsyncArraysElementRefs, render];
}
