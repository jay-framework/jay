import { JayElement, RenderElement, JayContract } from '@jay-framework/runtime';
import { SecureReferencesManager, elementBridge, sandboxElement as e } from '@jay-framework/secure';
import {
    CounterViewState,
    CounterRefs,
    IsPositive,
    // @ts-ignore
} from '../counter/counter.jay-contract?jay-workerSandbox';

export interface PageUsingCounterViewState {
    counter: CounterViewState;
}

export interface PageUsingCounterElementRefs {
    counter: CounterRefs;
}

export type PageUsingCounterElement = JayElement<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs
>;
export type PageUsingCounterElementRender = RenderElement<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs,
    PageUsingCounterElement
>;
export type PageUsingCounterElementPreRender = [
    PageUsingCounterElementRefs,
    PageUsingCounterElementRender,
];
export type PageUsingCounterContract = JayContract<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs
>;

export function render(): PageUsingCounterElementPreRender {
    const [counterRefManager, [refAdd, refSubtract]] = SecureReferencesManager.forElement(
        ['add', 'subtract'],
        [],
        [],
        [],
    );
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], [], {
        counter: counterRefManager,
    });
    const render = (viewState: PageUsingCounterViewState) =>
        elementBridge(viewState, refManager, () => [
            e(refAdd()),
            e(refSubtract()),
        ]) as PageUsingCounterElement;
    return [refManager.getPublicAPI() as PageUsingCounterElementRefs, render];
}
