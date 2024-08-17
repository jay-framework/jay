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
    elemRef as er,
    elemCollectionRef as ecr,
    RenderElementOptions,
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
    buttonExec: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    input: HTMLElementProxy<CompViewState, HTMLInputElement>;
    itemButton: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
    itemInput: HTMLElementCollectionProxy<Item, HTMLInputElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;

export function render(viewState: CompViewState, options?: RenderElementOptions): CompElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const refItemButton = ecr('itemButton');
            const refItemInput = ecr('itemInput');
            const result = er('result')
            const button = er('button')
            const buttonExec = er('buttonExec')
            const input = er('input');
            return de('div', {}, [
                e('div', { 'data-id': 'result' }, [dt((vs) => vs.text)], result()),
                e('button', { 'data-id': 'button' }, ['button'], button()),
                e(
                    'button',
                    { 'data-id': 'button-exec$' },
                    ['button exec native'],
                    buttonExec(),
                ),
                e('input', { 'data-id': 'input' }, [], input()),
                forEach(
                    (vs) => vs.items,
                    (vs1: Item) => {
                        return e('div', {}, [
                            e(
                                'button',
                                { 'data-id': da((vs) => `${vs.id}-itemButton`) },
                                [dt((vs) => vs.text)],
                                refItemButton(),
                            ),
                            e(
                                'input',
                                { 'data-id': da((vs) => `${vs.id}-itemInput`) },
                                [],
                                refItemInput(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]);
        },
        options,
    );
}
