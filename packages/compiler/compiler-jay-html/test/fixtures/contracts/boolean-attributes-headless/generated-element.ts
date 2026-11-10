import {
    JayElement,
    element as e,
    dynamicText as dt,
    booleanAttribute as ba,
    dynamicProperty as dp,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import {
    BooleanChoicesViewState,
    BooleanChoicesRefs,
    OptionOfInterestOfBooleanChoicesViewState,
} from '../boolean-choices-headless/boolean-choices-headless.jay-contract';

export interface BooleanAttributesHeadlessViewState {
    ch?: BooleanChoicesViewState;
    title: string;
}

export interface BooleanAttributesHeadlessElementRefs {
    ch: BooleanChoicesRefs;
}

export type BooleanAttributesHeadlessSlowViewState = {};
export type BooleanAttributesHeadlessFastViewState = BooleanAttributesHeadlessViewState;
export type BooleanAttributesHeadlessInteractiveViewState = BooleanAttributesHeadlessViewState;

export type BooleanAttributesHeadlessElement = JayElement<
    BooleanAttributesHeadlessViewState,
    BooleanAttributesHeadlessElementRefs
>;
export type BooleanAttributesHeadlessElementRender = RenderElement<
    BooleanAttributesHeadlessViewState,
    BooleanAttributesHeadlessElementRefs,
    BooleanAttributesHeadlessElement
>;
export type BooleanAttributesHeadlessElementPreRender = [
    BooleanAttributesHeadlessElementRefs,
    BooleanAttributesHeadlessElementRender,
];
export type BooleanAttributesHeadlessContract = JayContract<
    BooleanAttributesHeadlessViewState,
    BooleanAttributesHeadlessElementRefs,
    BooleanAttributesHeadlessSlowViewState,
    BooleanAttributesHeadlessFastViewState,
    BooleanAttributesHeadlessInteractiveViewState
>;

export function render(options?: RenderElementOptions): BooleanAttributesHeadlessElementPreRender {
    const [optionsRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [interestsRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        options: optionsRefManager,
    });
    const [chRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        interests: interestsRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        ch: chRefManager,
    });
    const render = (viewState: BooleanAttributesHeadlessViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('input', { type: 'checkbox', checked: dp((vs) => vs.ch?.accepted) }, []),
                e('input', { type: 'checkbox', checked: dp((vs) => vs.ch?.accepted) }, []),
                e('button', { disabled: ba((vs) => !vs.ch?.accepted) }, ['Send']),
                e('button', { disabled: ba((vs) => vs.ch?.accepted) }, ['Reset']),
                forEach(
                    (vs: BooleanAttributesHeadlessViewState) => vs.ch?.interests?.options,
                    (vs1: OptionOfInterestOfBooleanChoicesViewState) => {
                        return e('label', {}, [
                            e(
                                'input',
                                { type: 'checkbox', checked: dp((vs1) => vs1.selected) },
                                [],
                            ),
                            e(
                                'input',
                                { type: 'checkbox', checked: dp((vs1) => vs1.selected) },
                                [],
                            ),
                            e('span', {}, [dt((vs1) => vs1.label)]),
                        ]);
                    },
                    'id',
                ),
                de('select', { multiple: '' }, [
                    forEach(
                        (vs: BooleanAttributesHeadlessViewState) => vs.ch?.interests?.options,
                        (vs1: OptionOfInterestOfBooleanChoicesViewState) => {
                            return e(
                                'option',
                                { value: dp((vs1) => vs1.id), selected: ba((vs1) => vs1.selected) },
                                [dt((vs1) => vs1.label)],
                            );
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as BooleanAttributesHeadlessElement;
    return [refManager.getPublicAPI() as BooleanAttributesHeadlessElementRefs, render];
}
