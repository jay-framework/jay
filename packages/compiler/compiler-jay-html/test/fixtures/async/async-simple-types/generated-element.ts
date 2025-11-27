import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    resolved,
    pending,
    rejected,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface AsyncSimpleTypesViewState {
    s1: string;
    p1: Promise<string>;
}

export interface AsyncSimpleTypesElementRefs {}

export type AsyncSimpleTypesSlowViewState = {};
export type AsyncSimpleTypesFastViewState = {};
export type AsyncSimpleTypesInteractiveViewState = AsyncSimpleTypesViewState;

export type AsyncSimpleTypesElement = JayElement<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs
>;
export type AsyncSimpleTypesElementRender = RenderElement<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesElement
>;
export type AsyncSimpleTypesElementPreRender = [
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesElementRender,
];
export type AsyncSimpleTypesContract = JayContract<
    AsyncSimpleTypesViewState,
    AsyncSimpleTypesElementRefs,
    AsyncSimpleTypesSlowViewState,
    AsyncSimpleTypesFastViewState,
    AsyncSimpleTypesInteractiveViewState
>;

export function render(options?: RenderElementOptions): AsyncSimpleTypesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AsyncSimpleTypesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('span', {}, [dt((vs) => vs.s1)]),
                resolved<AsyncSimpleTypesViewState, string>(
                    (vs) => vs.p1,
                    () => e('span', {}, [dt((vs1) => vs1)]),
                ),
                pending(
                    (vs) => vs.p1,
                    () => e('span', {}, ['Still loading']),
                ),
                rejected(
                    (vs) => vs.p1,
                    () =>
                        e('span', {}, [
                            dt(
                                (vs1) =>
                                    `We have an error: ${vs1.name}, ${vs1.message}, ${vs1.stack}`,
                            ),
                        ]),
                ),
            ]),
        ) as AsyncSimpleTypesElement;
    return [refManager.getPublicAPI() as AsyncSimpleTypesElementRefs, render];
}
