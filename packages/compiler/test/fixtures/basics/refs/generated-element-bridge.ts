import {JayElement, HTMLElementProxy} from "jay-runtime";
import {elementBridge, sandboxElement as e, elemRef as er} from "jay-secure";

export interface RefsViewState {
  text: string
}

export interface RefsElementRefs {
  ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>,
  ref: HTMLElementProxy<RefsViewState, HTMLDivElement>
}

export type RefsElement = JayElement<RefsViewState, RefsElementRefs>

export function render(viewState: RefsViewState): RefsElement {
  return elementBridge(viewState, () => [
    e(er('ref1')),
    e(er('ref'))
  ])
}