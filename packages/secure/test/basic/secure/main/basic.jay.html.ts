import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";

export interface BasicViewState {
  text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export function render(viewState: BasicViewState): BasicElement {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
            e('div', {}, [dt(vs => vs.text)])
        ]));
}