import {JayElement, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {elementBridge} from "../../../../lib";
import {
    sandboxElement as e,
    sandboxForEach as forEach
} from "../../../../lib/sandbox/sandbox-element";

export interface Item {
    id: string,
    text: string
}

export interface CompViewState {
    text: string,
    items: Array<Item>
}

export interface CompElementRefs {
    result: HTMLElementProxy<CompViewState, HTMLDivElement>,
    buttonExecGlobal: HTMLElementProxy<CompViewState, HTMLButtonElement>,
    buttonExecElement: HTMLElementProxy<CompViewState, HTMLButtonElement>,
    itemButtonExecElement: HTMLElementCollectionProxy<Item, HTMLButtonElement>
}

export type CompElement = JayElement<CompViewState, CompElementRefs>

export function render(viewState: CompViewState, options?: RenderElementOptions): CompElement {
    return elementBridge(viewState, () => [
        e('buttonExecGlobal'),
        e('buttonExecElement'),
        e('input'),
        forEach((viewState: CompViewState) => viewState.items, 'id', () => [
            e('itemButtonExecElement')
            ]
        )
    ], ['itemButtonExecElement']) as unknown as CompElement;
}