import { JayElement, RenderElement, JayContract } from 'jay-runtime';
import { SecureReferencesManager, elementBridge } from 'jay-secure';

export interface EmptyElementViewState {}

export interface EmptyElementElementRefs {}

export type EmptyElementElement = JayElement<EmptyElementViewState, EmptyElementElementRefs>;
export type EmptyElementElementRender = RenderElement<
    EmptyElementViewState,
    EmptyElementElementRefs,
    EmptyElementElement
>;
export type EmptyElementElementPreRender = [EmptyElementElementRefs, EmptyElementElementRender];
export type EmptyElementContract = JayContract<EmptyElementViewState, EmptyElementElementRefs>;

export function render(): EmptyElementElementPreRender {
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: EmptyElementViewState) =>
        elementBridge(viewState, refManager, () => []) as EmptyElementElement;
    return [refManager.getPublicAPI() as EmptyElementElementRefs, render];
}
