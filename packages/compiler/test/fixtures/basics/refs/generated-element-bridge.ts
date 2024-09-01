import {JayElement, HTMLElementProxy, RenderElement} from 'jay-runtime';
import {elementBridge, sandboxElement as e, SecureReferencesManager} from 'jay-secure';

export interface RefsViewState {
    text: string;
}

export interface RefsElementRefs {
    ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>;
}

export type RefsElement = JayElement<RefsViewState, RefsElementRefs>;
export type RefsElementRender = RenderElement<RefsViewState, RefsElementRefs, RefsElement>
export type RefsElementPreRender = [refs: RefsElementRefs, RefsElementRender]

export function render(): RefsElementPreRender {
    const [refManager, [ref1, ref, ref3]] =
        SecureReferencesManager.forElement(['ref1', 'ref', 'ref3'], [], [], []);
    const render = (viewState: RefsViewState) =>
        elementBridge(viewState, refManager, () => [e(ref1()), e(ref()), e(ref3())]) as RefsElement;
    return [refManager.getPublicAPI() as RefsElementRefs, render]
}
