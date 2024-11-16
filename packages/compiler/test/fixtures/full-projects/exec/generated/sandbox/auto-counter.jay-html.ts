import { JayElement, RenderElement, HTMLElementProxy } from 'jay-runtime';
import { SecureReferencesManager, elementBridge, sandboxElement as e } from 'jay-secure';

export interface AutoCounterViewState {
    count: number;
}

export interface AutoCounterElementRefs {
    autoCount1: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
    autoCount2: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
}

export type AutoCounterElement = JayElement<AutoCounterViewState, AutoCounterElementRefs>;
export type AutoCounterElementRender = RenderElement<
    AutoCounterViewState,
    AutoCounterElementRefs,
    AutoCounterElement
>;
export type AutoCounterElementPreRender = [AutoCounterElementRefs, AutoCounterElementRender];

export function render(): AutoCounterElementPreRender {
    const [refManager, [refAutoCount1, refAutoCount2]] = SecureReferencesManager.forElement(
        ['autoCount1', 'autoCount2'],
        [],
        [],
        [],
    );
    const render = (viewState: AutoCounterViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refAutoCount1()),
            e(refAutoCount2()),
        ]) as AutoCounterElement;
    return [refManager.getPublicAPI() as AutoCounterElementRefs, render];
}
