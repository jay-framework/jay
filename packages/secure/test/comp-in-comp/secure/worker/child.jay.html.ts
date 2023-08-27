import {JayElement, HTMLElementProxy} from "jay-runtime";
import {elementBridge, elemRef} from "../../../../lib";
import {sandboxElement as e} from "../../../../lib/";

export interface ChildViewState {
    textFromProp: string,
    textFromAPI: string
}

export interface ChildElementRefs {
    eventToParent: HTMLElementProxy<ChildViewState, HTMLButtonElement>,
    eventToParentToChildProp: HTMLElementProxy<ChildViewState, HTMLButtonElement>,
    eventToParentToChildApi: HTMLElementProxy<ChildViewState, HTMLButtonElement>
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>

export function render(viewState: ChildViewState): ChildElement {
    return elementBridge(viewState, () => [
        e(elemRef('eventToParent')),
        e(elemRef('eventToParentToChildProp')),
        e(elemRef('eventToParentToChildApi'))
    ]);
}