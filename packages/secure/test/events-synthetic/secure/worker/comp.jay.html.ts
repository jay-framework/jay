import {JayElement, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {elementBridge} from "../../../../lib/sandbox/sandbox-bridge";
import {
    sandboxElement as e,
    sandboxForEach as forEach
} from "../../../../lib/sandbox/sandbox-element";
import {elemCollectionRef, elemRef} from "../../../../lib";

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
    button: HTMLElementProxy<CompViewState, HTMLButtonElement>,
    buttonExec$: HTMLElementProxy<CompViewState, HTMLButtonElement>,
    input: HTMLElementProxy<CompViewState, HTMLInputElement>,
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>,
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>
}

export type CompElement = JayElement<CompViewState, CompElementRefs>

export function render(viewState: CompViewState, options?: RenderElementOptions): CompElement {
    return elementBridge(viewState, () => {
        const refItemButton = elemCollectionRef('itemButton')
        const refItemInput = elemCollectionRef('itemInput')
        return [
            e(elemRef('button')),
            e(elemRef('buttonExec$')),
            e(elemRef('input')),
            forEach((viewState: CompViewState) => viewState.items, 'id', () => [
                    e(refItemButton()),
                    e(refItemInput())
                ]
            )
        ]
    }) as unknown as CompElement;
}