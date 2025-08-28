import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    resolved,
    pending,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface O1OfAsyncObjectsViewState {
    s2: string;
    n2: number;
}

export interface Po1OfAsyncObjectsViewState {
    ps2: string;
    pn2: number;
}

export interface AsyncObjectsViewState {
    o1: O1OfAsyncObjectsViewState;
    po1: Promise<Po1OfAsyncObjectsViewState>;
}

export interface AsyncObjectsElementRefs {}

export type AsyncObjectsElement = JayElement<AsyncObjectsViewState, AsyncObjectsElementRefs>;
export type AsyncObjectsElementRender = RenderElement<
    AsyncObjectsViewState,
    AsyncObjectsElementRefs,
    AsyncObjectsElement
>;
export type AsyncObjectsElementPreRender = [AsyncObjectsElementRefs, AsyncObjectsElementRender];
export type AsyncObjectsContract = JayContract<AsyncObjectsViewState, AsyncObjectsElementRefs>;

export function render(options?: RenderElementOptions): AsyncObjectsElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: AsyncObjectsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('span', {}, [dt((vs) => vs.o1?.s2)]),
                e('span', {}, [dt((vs) => vs.o1?.n2)]),
                pending(
                    (vs) => vs.po1,
                    () => e('div', {}, ['still loading the object']),
                ),
                resolved<AsyncObjectsViewState, Po1OfAsyncObjectsViewState>(
                    (vs) => vs.po1,
                    () =>
                        e('div', {}, [
                            e('span', {}, [dt((vs1) => vs1.ps2)]),
                            e('span', {}, [dt((vs1) => vs1.pn2)]),
                        ]),
                ),
            ]),
        ) as AsyncObjectsElement;
    return [refManager.getPublicAPI() as AsyncObjectsElementRefs, render];
}
