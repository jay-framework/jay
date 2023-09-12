import {JayElement} from "jay-runtime";
import {elementBridge} from "jay-secure";

export interface SimpleDynamicTextViewState {

}

export interface SimpleDynamicTextElementRefs {}

export type SimpleDynamicTextElement = JayElement<SimpleDynamicTextViewState, SimpleDynamicTextElementRefs>

export function render(viewState: SimpleDynamicTextViewState): SimpleDynamicTextElement {
  return elementBridge(viewState, () => [])
}