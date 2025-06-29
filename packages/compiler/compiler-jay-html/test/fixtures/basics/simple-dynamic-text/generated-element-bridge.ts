import { JayElement, RenderElement, JayContract } from '@jay-framework/runtime';
import { SecureReferencesManager, elementBridge } from '@jay-framework/secure';

export interface SimpleDynamicTextViewState {
    s1: string;
}

export interface SimpleDynamicTextElementRefs {}

export type SimpleDynamicTextElement = JayElement<
    SimpleDynamicTextViewState,
    SimpleDynamicTextElementRefs
>;
export type SimpleDynamicTextElementRender = RenderElement<
    SimpleDynamicTextViewState,
    SimpleDynamicTextElementRefs,
    SimpleDynamicTextElement
>;
export type SimpleDynamicTextElementPreRender = [
    SimpleDynamicTextElementRefs,
    SimpleDynamicTextElementRender,
];
export type SimpleDynamicTextContract = JayContract<
    SimpleDynamicTextViewState,
    SimpleDynamicTextElementRefs
>;

export function render(): SimpleDynamicTextElementPreRender {
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: SimpleDynamicTextViewState) =>
        elementBridge(viewState, refManager, () => []) as SimpleDynamicTextElement;
    return [refManager.getPublicAPI() as SimpleDynamicTextElementRefs, render];
}
