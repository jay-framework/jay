import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ItemOfOptionOfDuplicateRefNamesViewState {
    id: string;
    label: string;
}

export interface OptionOfDuplicateRefNamesViewState {
    id: string;
    name: string;
    items: Array<ItemOfOptionOfDuplicateRefNamesViewState>;
}

export interface ItemOfModifierOfDuplicateRefNamesViewState {
    id: string;
    label: string;
}

export interface ModifierOfDuplicateRefNamesViewState {
    id: string;
    name: string;
    items: Array<ItemOfModifierOfDuplicateRefNamesViewState>;
}

export interface DuplicateRefNamesViewState {
    title: string;
    options: Array<OptionOfDuplicateRefNamesViewState>;
    modifiers: Array<ModifierOfDuplicateRefNamesViewState>;
}

export interface DuplicateRefNamesElementRefs {
    options: {
        items: {
            button: HTMLElementCollectionProxy<
                ItemOfOptionOfDuplicateRefNamesViewState,
                HTMLButtonElement
            >;
        };
    };
    modifiers: {
        items: {
            button: HTMLElementCollectionProxy<
                ItemOfModifierOfDuplicateRefNamesViewState,
                HTMLButtonElement
            >;
        };
    };
}

export type DuplicateRefNamesSlowViewState = Pick<DuplicateRefNamesViewState, 'title'> & {
    options: Array<DuplicateRefNamesViewState['options'][number]>;
    modifiers: Array<DuplicateRefNamesViewState['modifiers'][number]>;
};

export type DuplicateRefNamesFastViewState = {};

export type DuplicateRefNamesInteractiveViewState = {};

export type DuplicateRefNamesElement = JayElement<
    DuplicateRefNamesViewState,
    DuplicateRefNamesElementRefs
>;
export type DuplicateRefNamesElementRender = RenderElement<
    DuplicateRefNamesViewState,
    DuplicateRefNamesElementRefs,
    DuplicateRefNamesElement
>;
export type DuplicateRefNamesElementPreRender = [
    DuplicateRefNamesElementRefs,
    DuplicateRefNamesElementRender,
];
export type DuplicateRefNamesContract = JayContract<
    DuplicateRefNamesViewState,
    DuplicateRefNamesElementRefs,
    DuplicateRefNamesSlowViewState,
    DuplicateRefNamesFastViewState,
    DuplicateRefNamesInteractiveViewState
>;

export function render(options?: RenderElementOptions): DuplicateRefNamesElementPreRender {
    const [itemsRefManager, [refButton]] = ReferencesManager.for(options, [], ['button'], [], []);
    const [optionsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const [itemsRefManager2, [refButton2]] = ReferencesManager.for(options, [], ['button'], [], []);
    const [modifiersRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager2,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        options: optionsRefManager,
        modifiers: modifiersRefManager,
    });
    const render = (viewState: DuplicateRefNamesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                forEach(
                    (vs: DuplicateRefNamesViewState) => vs.options,
                    (vs1: OptionOfDuplicateRefNamesViewState) => {
                        return e('div', {}, [
                            e('h2', {}, [dt((vs1) => vs1.name)]),
                            de('ul', {}, [
                                forEach(
                                    (vs1: OptionOfDuplicateRefNamesViewState) => vs1.items,
                                    (vs2: ItemOfOptionOfDuplicateRefNamesViewState) => {
                                        return e('li', {}, [
                                            e('span', {}, [dt((vs2) => vs2.label)]),
                                            e('button', {}, ['Click'], refButton()),
                                        ]);
                                    },
                                    'label',
                                ),
                            ]),
                        ]);
                    },
                    'name',
                ),
                forEach(
                    (vs: DuplicateRefNamesViewState) => vs.modifiers,
                    (vs1: ModifierOfDuplicateRefNamesViewState) => {
                        return e('div', {}, [
                            e('h2', {}, [dt((vs1) => vs1.name)]),
                            de('ul', {}, [
                                forEach(
                                    (vs1: ModifierOfDuplicateRefNamesViewState) => vs1.items,
                                    (vs2: ItemOfModifierOfDuplicateRefNamesViewState) => {
                                        return e('li', {}, [
                                            e('span', {}, [dt((vs2) => vs2.label)]),
                                            e('button', {}, ['Click'], refButton2()),
                                        ]);
                                    },
                                    'label',
                                ),
                            ]),
                        ]);
                    },
                    'name',
                ),
            ]),
        ) as DuplicateRefNamesElement;
    return [refManager.getPublicAPI() as DuplicateRefNamesElementRefs, render];
}
