import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    dynamicProperty as dp,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
} from 'jay-runtime';

export interface ItemViewState {
    title: string;
    isEditing: boolean;
    editText: string;
    isCompleted: boolean;
}

export interface ItemElementRefs {
    completed: HTMLElementProxy<ItemViewState, HTMLInputElement>;
    label: HTMLElementProxy<ItemViewState, HTMLLabelElement>;
    button: HTMLElementProxy<ItemViewState, HTMLButtonElement>;
    title: HTMLElementProxy<ItemViewState, HTMLInputElement>;
}

export type ItemElement = JayElement<ItemViewState, ItemElementRefs>;
export type ItemElementRender = RenderElement<ItemViewState, ItemElementRefs, ItemElement>;
export type ItemElementPreRender = [ItemElementRefs, ItemElementRender];

export function render(options?: RenderElementOptions): ItemElementPreRender {
    const [refManager, [refCompleted, refLabel, refButton, refTitle]] = ReferencesManager.for(
        options,
        ['completed', 'label', 'button', 'title'],
        [],
        [],
        [],
    );
    const render = (viewState: ItemViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e(
                'li',
                {
                    class: da(
                        (vs) =>
                            `${vs.isCompleted ? 'completed' : ''} ${vs.isEditing ? 'editing' : ''}`,
                    ),
                },
                [
                    e('div', { class: 'view' }, [
                        e(
                            'input',
                            {
                                class: 'toggle',
                                type: 'checkbox',
                                checked: dp((vs) => vs.isCompleted),
                            },
                            [],
                            refCompleted(),
                        ),
                        e('label', {}, [dt((vs) => vs.title)], refLabel()),
                        e('button', { class: 'destroy' }, [], refButton()),
                    ]),
                    e('input', { class: 'edit', value: dp((vs) => vs.editText) }, [], refTitle()),
                ],
            ),
        ) as ItemElement;
    return [refManager.getPublicAPI() as ItemElementRefs, render];
}
