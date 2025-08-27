import {
    JayElement,
    element as e,
    dynamicElement as de,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract, resolved, pending, rejected,
} from '@jay-framework/runtime';

export interface AsyncSimpleTypesViewState {
    s1: string;
    p1: Promise<string>;
}

export interface AsyncSimpleTypesElementRefs {}

export type AsyncSimpleTypesElement = JayElement<AsyncSimpleTypesViewState, AsyncSimpleTypesElementRefs>;
export type AsyncSimpleTypesElementRender = RenderElement<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesElement
>;
export type AsyncSimpleTypesElementPreRender = [AsyncSimpleTypesElementRefs, AsyncSimpleTypesElementRender];
export type AsyncSimpleTypesContract = JayContract<AsyncSimpleTypesViewState, AsyncSimpleTypesElementRefs>;


export function render(options?: RenderElementOptions): AsyncSimpleTypesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AsyncSimpleTypesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('span', {}, [dt((vs) => vs.s1)]),
                resolved(vs => vs.p1, () => dt((vs: string) => vs)),
                pending(vs => vs.p1, () => "Still loading"),
                rejected(vs => vs.p1, () => dt((vs: Error) => `We have an error: ${vs.message}`))
            ]),
        ) as AsyncSimpleTypesElement;
    return [refManager.getPublicAPI() as AsyncSimpleTypesElementRefs, render];
}
