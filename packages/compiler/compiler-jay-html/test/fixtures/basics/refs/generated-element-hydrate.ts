import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';

export interface RefsViewState {
    text: string;
}

export interface RefsElementRefs {
    ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>;
}

export type RefsSlowViewState = {};
export type RefsFastViewState = RefsViewState;
export type RefsInteractiveViewState = RefsViewState;

export type RefsElement = JayElement<RefsViewState, RefsElementRefs>;
export type RefsElementRender = RenderElement<RefsViewState, RefsElementRefs, RefsElement>;
export type RefsElementPreRender = [RefsElementRefs, RefsElementRender];
export type RefsContract = JayContract<
    RefsViewState,
    RefsElementRefs,
    RefsSlowViewState,
    RefsFastViewState,
    RefsInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): RefsElementPreRender {
    const [refManager, [refRef1, refRef, refRef3]] = ReferencesManager.for(
        options,
        ['ref1', 'ref', 'ref3'],
        [],
        [],
        [],
    );
    const render = (viewState: RefsViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.text, refRef1()),
                adoptText('0/1', (vs) => vs.text, refRef()),
                adoptText('0/2/0', (vs) => vs.text, refRef3()),
            ]),
        ) as RefsElement;
    return [refManager.getPublicAPI() as RefsElementRefs, render];
}
