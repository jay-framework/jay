import {JayElement, RenderElement} from 'jay-runtime';
import {elementBridge, SecureReferencesManager} from 'jay-secure';

export interface BasicViewState {
    text: string;
}

export interface BasicElementRefs {}

export type BasicElement = JayElement<BasicViewState, BasicElementRefs>;
export type BasicElementRender = RenderElement<BasicViewState, BasicElementRefs, BasicElement>
export type BasicElementPreRender = [refs: BasicElementRefs, BasicElementRender]

export function render(): BasicElementPreRender {
    const [refManager, []] =
        SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: BasicViewState) =>  elementBridge(viewState, refManager, () => []);
    return [refManager.getPublicAPI() as BasicElementRefs, render]
}
