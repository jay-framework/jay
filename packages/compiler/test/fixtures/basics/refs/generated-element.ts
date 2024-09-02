import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
} from 'jay-runtime';

export interface RefsViewState {
    text: string;
}

export interface RefsElementRefs {
    ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>;
}

export type RefsElement = JayElement<RefsViewState, RefsElementRefs>;
export type RefsElementRender = RenderElement<RefsViewState, RefsElementRefs, RefsElement>;
export type RefsElementPreRender = [refs: RefsElementRefs, RefsElementRender];

export function render(options?: RenderElementOptions): RefsElementPreRender {
    const [refManager, [refRef1, refRef, refRef3]] = ReferencesManager.for(
        options,
        ['ref1', 'ref', 'ref3'],
        [],
        [],
        [],
    );
    const render = (viewState: RefsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.text)], refRef1()),
                e('div', {}, [dt((vs) => vs.text)], refRef()),
                e('div', {}, [e('div', {}, [dt((vs) => vs.text)], refRef3())]),
            ]),
        ) as RefsElement;
    return [refManager.getPublicAPI() as RefsElementRefs, render];
}
