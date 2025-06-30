import { JayElement, RenderElement } from '@jay-framework/runtime';
import { elementBridge, SecureReferencesManager } from '../../../../lib/';

export interface BasicViewState {
    text: string;
}

export interface BasicElementRefs {}

export type BasicElement = JayElement<BasicViewState, BasicElementRefs>;
type BasicElementRender = RenderElement<BasicViewState, BasicElementRefs, BasicElement>;
type BasicElementPreRender = [refs: BasicElementRefs, BasicElementRender];

export function render(): BasicElementPreRender {
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: BasicViewState) => elementBridge(viewState, refManager, () => []);
    return [refManager.getPublicAPI() as BasicElementRefs, render];
}
