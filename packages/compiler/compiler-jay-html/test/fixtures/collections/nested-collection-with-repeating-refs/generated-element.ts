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

export interface ChoiceOfOptionOfNestedCollectionWithRepeatingRefsViewState {
    choiceId: string;
    choiceName: string;
}

export interface OptionOfNestedCollectionWithRepeatingRefsViewState {
    id: string;
    name: string;
    choices: Array<ChoiceOfOptionOfNestedCollectionWithRepeatingRefsViewState>;
}

export interface ChoiceOfModifierOfNestedCollectionWithRepeatingRefsViewState {
    choiceId: string;
    choiceName: string;
}

export interface ModifierOfNestedCollectionWithRepeatingRefsViewState {
    id: string;
    name: string;
    choices: Array<ChoiceOfModifierOfNestedCollectionWithRepeatingRefsViewState>;
}

export interface NestedCollectionWithRepeatingRefsViewState {
    options: Array<OptionOfNestedCollectionWithRepeatingRefsViewState>;
    modifiers: Array<ModifierOfNestedCollectionWithRepeatingRefsViewState>;
}

export interface NestedCollectionWithRepeatingRefsElementRefs {
    options: {
        choices: {
            optionsChoicesChoiceButton: HTMLElementCollectionProxy<
                ChoiceOfOptionOfNestedCollectionWithRepeatingRefsViewState,
                HTMLButtonElement
            >;
        };
    };
    modifiers: {
        choices: {
            choiceButton: HTMLElementCollectionProxy<
                ChoiceOfModifierOfNestedCollectionWithRepeatingRefsViewState,
                HTMLButtonElement
            >;
        };
    };
}

export type NestedCollectionWithRepeatingRefsSlowViewState = {};
export type NestedCollectionWithRepeatingRefsFastViewState = {};
export type NestedCollectionWithRepeatingRefsInteractiveViewState =
    NestedCollectionWithRepeatingRefsViewState;

export type NestedCollectionWithRepeatingRefsElement = JayElement<
    NestedCollectionWithRepeatingRefsViewState,
    NestedCollectionWithRepeatingRefsElementRefs
>;
export type NestedCollectionWithRepeatingRefsElementRender = RenderElement<
    NestedCollectionWithRepeatingRefsViewState,
    NestedCollectionWithRepeatingRefsElementRefs,
    NestedCollectionWithRepeatingRefsElement
>;
export type NestedCollectionWithRepeatingRefsElementPreRender = [
    NestedCollectionWithRepeatingRefsElementRefs,
    NestedCollectionWithRepeatingRefsElementRender,
];
export type NestedCollectionWithRepeatingRefsContract = JayContract<
    NestedCollectionWithRepeatingRefsViewState,
    NestedCollectionWithRepeatingRefsElementRefs,
    NestedCollectionWithRepeatingRefsSlowViewState,
    NestedCollectionWithRepeatingRefsFastViewState,
    NestedCollectionWithRepeatingRefsInteractiveViewState
>;

export function render(
    options?: RenderElementOptions,
): NestedCollectionWithRepeatingRefsElementPreRender {
    const [choicesRefManager, [refOptionsChoicesChoiceButton]] = ReferencesManager.for(
        options,
        [],
        ['optionsChoicesChoiceButton'],
        [],
        [],
    );
    const [optionsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        choices: choicesRefManager,
    });
    const [choicesRefManager2, [refChoiceButton]] = ReferencesManager.for(
        options,
        [],
        ['choiceButton'],
        [],
        [],
    );
    const [modifiersRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        choices: choicesRefManager2,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        options: optionsRefManager,
        modifiers: modifiersRefManager,
    });
    const render = (viewState: NestedCollectionWithRepeatingRefsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                forEach(
                    (vs: NestedCollectionWithRepeatingRefsViewState) => vs.options,
                    (vs1: OptionOfNestedCollectionWithRepeatingRefsViewState) => {
                        return e('div', {}, [
                            e('div', {}, [dt((vs1) => vs1.name)]),
                            de('div', { class: 'option-choices' }, [
                                forEach(
                                    (vs1: OptionOfNestedCollectionWithRepeatingRefsViewState) =>
                                        vs1.choices,
                                    (
                                        vs2: ChoiceOfOptionOfNestedCollectionWithRepeatingRefsViewState,
                                    ) => {
                                        return e(
                                            'button',
                                            { class: 'choice-button' },
                                            [dt((vs2) => ` ${vs2.choiceName} `)],
                                            refOptionsChoicesChoiceButton(),
                                        );
                                    },
                                    'choiceId',
                                ),
                            ]),
                        ]);
                    },
                    'id',
                ),
                forEach(
                    (vs: NestedCollectionWithRepeatingRefsViewState) => vs.modifiers,
                    (vs1: ModifierOfNestedCollectionWithRepeatingRefsViewState) => {
                        return e('div', {}, [
                            e('div', {}, [dt((vs1) => vs1.name)]),
                            de('div', { class: 'modifier-choices' }, [
                                forEach(
                                    (vs1: ModifierOfNestedCollectionWithRepeatingRefsViewState) =>
                                        vs1.choices,
                                    (
                                        vs2: ChoiceOfModifierOfNestedCollectionWithRepeatingRefsViewState,
                                    ) => {
                                        return e(
                                            'button',
                                            { class: 'choice-button' },
                                            [dt((vs2) => ` ${vs2.choiceName} `)],
                                            refChoiceButton(),
                                        );
                                    },
                                    'choiceId',
                                ),
                            ]),
                        ]);
                    },
                    'id',
                ),
            ]),
        ) as NestedCollectionWithRepeatingRefsElement;
    return [refManager.getPublicAPI() as NestedCollectionWithRepeatingRefsElementRefs, render];
}
