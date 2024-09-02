import { JayElement, RenderElement } from 'jay-runtime';
import { elementBridge, SecureReferencesManager } from 'jay-secure';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export type ConditionsElement = JayElement<ConditionsViewState, ConditionsElementRefs>;
export type ConditionsElementRender = RenderElement<
    ConditionsViewState,
    ConditionsElementRefs,
    ConditionsElement
>;
export type ConditionsElementPreRender = [refs: ConditionsElementRefs, ConditionsElementRender];

export function render(): ConditionsElementPreRender {
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: ConditionsViewState) =>
        elementBridge(viewState, refManager, () => []);
    return [refManager.getPublicAPI() as ConditionsElementRefs, render];
}
