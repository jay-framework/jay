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
} from 'jay-runtime';

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
    button: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    buttonExec$: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    input: HTMLElementProxy<CompViewState, HTMLInputElement>;
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;
export type CompElementRender = RenderElement<CompViewState, CompElementRefs, CompElement>;
export type CompElementPreRender = [CompElementRefs, CompElementRender];

export function render(options?: RenderElementOptions): CompElementPreRender {
    const [refManager, [result, button, buttonExec, input, itemButton, itemInput]] =
        ReferencesManager.for(
            options,
            ['result', 'button', 'buttonExec', 'input'],
            ['itemButton', 'itemInput'],
            [],
            [],
        );
    const render = (viewState: CompViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return de('div', {}, [
                e('div', { 'data-id': 'result' }, [dt((vs) => vs.text)], result()),
                e('button', { 'data-id': 'button' }, ['button'], button()),
                e('button', { 'data-id': 'button-exec$' }, ['button exec native'], buttonExec()),
                e('input', { 'data-id': 'input' }, [], input()),
                forEach(
                    (vs) => vs.items,
                    (vs1: Item) => {
                        return e('div', {}, [
                            e(
                                'button',
                                { 'data-id': da((vs) => `${vs.id}-itemButton`) },
                                [dt((vs) => vs.text)],
                                itemButton(),
                            ),
                            e(
                                'input',
                                { 'data-id': da((vs) => `${vs.id}-itemInput`) },
                                [],
                                itemInput(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]);
        }) as CompElement;
    return [refManager.getPublicAPI() as CompElementRefs, render];
}
