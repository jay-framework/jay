import {JayElement} from "jay-runtime";
import {workerStub} from "../../../../lib/worker-stub";

export interface BasicViewState {
    text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export function render(viewState: BasicViewState): BasicElement {
    return workerStub('a', viewState);
}