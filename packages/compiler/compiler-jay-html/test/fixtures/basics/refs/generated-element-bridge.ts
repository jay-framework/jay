import { JayElement, RenderElement, HTMLElementProxy, JayContract } from '@jay-framework/runtime';
import { SecureReferencesManager, elementBridge, sandboxElement as e } from '@jay-framework/secure';

export interface RefsViewState {
    text: string;
}

export interface RefsElementRefs {
    ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>;
}

export type RefsSlowViewState = {};
export type RefsFastViewState = {};
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

export function render(): RefsElementPreRender {
    const [refManager, [refRef1, refRef, refRef3]] = SecureReferencesManager.forElement(
        ['ref1', 'ref', 'ref3'],
        [],
        [],
        [],
    );
    const render = (viewState: RefsViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refRef1()),
            e(refRef()),
            e(refRef3()),
        ]) as RefsElement;
    return [refManager.getPublicAPI() as RefsElementRefs, render];
}
