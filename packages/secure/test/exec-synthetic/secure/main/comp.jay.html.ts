import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, dynamicElement as de, forEach, ConstructContext, HTMLElementCollectionProxy, HTMLElementProxy, RenderElementOptions} from "jay-runtime";

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
    return ConstructContext.withRootContext(viewState, () =>
        de('div', {}, [
            e('div', {ref: 'result', "data-id": 'result'}, [dt(vs => vs.text)]),
            e('button', {ref: 'buttonExecGlobal', "data-id": 'button-exec-global'}, ['button exec global']),
            e('button', {ref: 'buttonExecElement', "data-id": 'button-exec-element'}, ['button exec element']),
            forEach(vs => vs.items, (vs1: Item) => {
                return e('div', {matchby: 'id'}, [
                    e('button', {ref: 'itemButtonExecElement', "data-id": da(vs => `item-${vs.id}-button-exec-element`)}, [dt(vs => `item ${vs.text} exec element`)])
                ])}, 'undefined')
        ]), options, ['itemButtonExecElement']);
}