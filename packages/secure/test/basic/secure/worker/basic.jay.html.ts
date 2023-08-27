import {JayElement} from "jay-runtime";
import {elementBridge} from "../../../../lib/";

export interface BasicViewState {
    text: string
}

export interface BasicElementRefs {}

export type BasicElement = JayElement<BasicViewState, BasicElementRefs>

export function render(viewState: BasicViewState): BasicElement {
    return elementBridge(viewState, () => []);
}