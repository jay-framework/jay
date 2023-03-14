import {JayElement} from "jay-runtime";
import {elementBridge} from "../../../../lib/sandbox/worker-bridge";

export interface BasicViewState {
    text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export function render(viewState: BasicViewState): BasicElement {
    return elementBridge(viewState);
}