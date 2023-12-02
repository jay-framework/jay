import { JayElement } from 'jay-runtime';
import { elementBridge } from 'jay-secure';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export type ConditionsElement = JayElement<ConditionsViewState, ConditionsElementRefs>;

export function render(viewState: ConditionsViewState): ConditionsElement {
    return elementBridge(viewState, () => []);
}
