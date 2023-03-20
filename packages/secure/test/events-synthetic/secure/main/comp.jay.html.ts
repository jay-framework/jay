import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, dynamicElement as de, forEach, ConstructContext, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

export interface Item {
    id: string,
    text: string
}

export interface CompViewState {
    text: string,
    items: Array<Item>
}

export interface CompRefs {
    button: HTMLElementProxy<CompViewState, HTMLButtonElement>,
    input: HTMLElementProxy<CompViewState, HTMLInputElement>,
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>,
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>
}

export type CompElement = JayElement<CompViewState, CompRefs>

export function render(viewState: CompViewState, options?: RenderElementOptions): CompElement {
    return ConstructContext.withRootContext(viewState, () =>
        de('div', {}, [
            e('div', {ref: 'result', "data-id": 'result'}, [dt(vs => vs.text)]),
            e('button', {ref: 'button', "data-id": 'button'}, ['button']),
            e('input', {ref: 'input', "data-id": 'input'}, []),
            forEach(vs => vs.items, (vs1: Item) => {
                return e('div', {}, [
                    e('button', {ref: 'itemButton', "data-id": da(vs => vs.id)}, [dt(vs => vs.text)]),
                    e('input', {ref: 'itemInput', "data-id": da(vs => vs.id)}, [])
                ])}, 'undefined')
        ]), options, ['itemButton', 'itemInput']);
}