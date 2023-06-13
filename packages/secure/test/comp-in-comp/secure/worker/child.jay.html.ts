import {JayElement, HTMLElementProxy} from "jay-runtime";
import {elementBridge} from "../../../../lib";
import {sandboxElement as e} from "../../../../lib/";

export interface ChildViewState {
  text: string,
  text2: string
}

export interface ChildElementRefs {
  button: HTMLElementProxy<ChildViewState, HTMLButtonElement>
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>

export function render(viewState: ChildViewState): ChildElement {
    return elementBridge(viewState, () => [
        e('button')
    ]);
}