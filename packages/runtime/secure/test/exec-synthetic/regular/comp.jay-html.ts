import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from '@jay-framework/runtime';

export interface Item {
    id: string;
    text: string;
}

export interface CompViewState {
    text: string;
    items: Array<Item>;
}

export interface CompElementRefs {
    result: HTMLElementProxy<CompViewState, HTMLDivElement>;
    buttonExecGlobal: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    buttonExecElement: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    itemButtonExecElement: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;
export type CompElementRender = RenderElement<CompViewState, CompElementRefs, CompElement>;
export type CompElementPreRender = [CompElementRefs, CompElementRender];

export function render(options?: RenderElementOptions): CompElementPreRender {
    const [refManager, [result, buttonExecGlobal, buttonExecElement, itemButtonExecElement]] =
        ReferencesManager.for(
            options,
            ['result', 'buttonExecGlobal', 'buttonExecElement'],
            ['itemButtonExecElement'],
            [],
            [],
        );
    const render = (viewState: CompViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return de('div', {}, [
                e('div', { 'data-id': 'result' }, [dt((vs) => vs.text)], result()),
                e(
                    'button',
                    { 'data-id': 'button-exec-global' },
                    ['button exec global'],
                    buttonExecGlobal(),
                ),
                e(
                    'button',
                    { 'data-id': 'button-exec-element' },
                    ['button exec element'],
                    buttonExecElement(),
                ),
                forEach(
                    (vs) => vs.items,
                    (vs1: Item) => {
                        return e('div', {}, [
                            e(
                                'button',
                                { 'data-id': da((vs) => `item-${vs.id}-button-exec-element`) },
                                [dt((vs) => ` item ${vs.text} exec element `)],
                                itemButtonExecElement(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]);
        }) as CompElement;
    return [refManager.getPublicAPI() as CompElementRefs, render];
}
