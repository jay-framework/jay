import {JayElement, element as e, dynamicText as dt, ConstructContext} from "jay-runtime";
import {setViewState} from "./view-state-model";

export interface BasicViewState {
    text: string
}

export interface BasicRefs {}

export type BasicElement = JayElement<BasicViewState, BasicRefs>

export function render(viewState: BasicViewState): BasicElement {
    setViewState(viewState)
    return {
        dom: null,
        update: (newData: BasicViewState) => {setViewState(newData)},
        mount: () => {},
        unmount: () => {},
        refs: {
        }
    }
}