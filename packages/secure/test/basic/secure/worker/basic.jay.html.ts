import {JayElement} from "jay-runtime";
import {elementBridge} from "../../../../lib/worker-bridge";

export interface BasicViewState {
    text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export function render(viewState: BasicViewState): BasicElement {
    return elementBridge(0, viewState);
}