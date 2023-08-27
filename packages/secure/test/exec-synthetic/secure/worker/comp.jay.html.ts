import {JayElement, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {elemCollectionRef, elementBridge, elemRef} from "../../../../lib";
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
    return elementBridge(viewState, () => {
        const refItemButtonExecElement = elemCollectionRef('itemButtonExecElement')
        return [
            e(elemRef('buttonExecGlobal')),
            e(elemRef('buttonExecElement')),
            e(elemRef('input')),
            forEach((viewState: CompViewState) => viewState.items, 'id', () => [
                    e(refItemButtonExecElement())
                ]
            )
        ]
    }) as unknown as CompElement;
}