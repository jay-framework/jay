import {
    JayElement,
    RenderElement,
} from 'jay-runtime';
import { SecureReferencesManager,
    elementBridge,
    sandboxElement as e,} from 'jay-secure';
import {
    NamedContractViewState,
    NamedContractRefs,
// @ts-ignore
} from '../named-counter/named-counter.jay-contract?jay-workerSandbox';

export interface PageViewState {
    namedCounter: NamedContractViewState;
}

export interface PageElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];

export function render(): PageElementPreRender {
    const [counterRefManager, [refAdd, refSubtract]] = SecureReferencesManager.forElement(
        ['add', 'subtract'],
        [],
        [],
        [],
    );
    const [namedCounterRefManager, []] = SecureReferencesManager.forElement([], [], [], [], {
        counter: counterRefManager,
    });
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], [], {
        namedCounter: namedCounterRefManager,
    });
    const render = (viewState: PageViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refAdd()),
            e(refSubtract()),
        ]) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}
