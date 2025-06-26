import { JayElement, RenderElement, JayContract } from 'jay-runtime';
import { SecureReferencesManager, elementBridge, sandboxElement as e } from 'jay-secure';
import {
    NamedContractViewState,
    NamedContractRefs,
    // @ts-ignore
} from '../named-counter/named-counter.jay-contract?jay-workerSandbox';
// @ts-ignore
import { IsPositive } from '../counter/counter.jay-contract?jay-workerSandbox';

export interface PageUsingNamedCounterViewState {
    namedCounter: NamedContractViewState;
}

export interface PageUsingNamedCounterElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageUsingNamedCounterElement = JayElement<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs
>;
export type PageUsingNamedCounterElementRender = RenderElement<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterElement
>;
export type PageUsingNamedCounterElementPreRender = [
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterElementRender,
];
export type PageUsingNamedCounterContract = JayContract<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs
>;

export function render(): PageUsingNamedCounterElementPreRender {
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
    const render = (viewState: PageUsingNamedCounterViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refAdd()),
            e(refSubtract()),
        ]) as PageUsingNamedCounterElement;
    return [refManager.getPublicAPI() as PageUsingNamedCounterElementRefs, render];
}
