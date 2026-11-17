import {
    JayElement,
    element as e,
    dynamicText as dt,
    booleanAttribute as ba,
    dynamicProperty as dp,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import {
    BooleanChoicesViewState,
    BooleanChoicesRefs,
    InterestOfBooleanChoicesViewState,
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): BooleanAttributesHeadlessElementPreRender {
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
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                adoptElement('S0/0/1', { checked: dp((vs) => vs.ch?.accepted) }, []),
                adoptElement('S0/0/2', { checked: dp((vs) => vs.ch?.accepted) }, []),
                adoptElement('S0/0/3', { disabled: ba((vs) => !vs.ch?.accepted) }, []),
                adoptElement('S0/0/4', { disabled: ba((vs) => vs.ch?.accepted) }, []),
                hydrateForEach(
                    (vs: BooleanAttributesHeadlessViewState) => vs.ch?.interests?.options,
                    'id',
                    'S0/0/5',
                    (vs1: OptionOfInterestOfBooleanChoicesViewState) => [
                        adoptElement('S1/0', { checked: dp((vs1) => vs1.selected) }, []),
                        adoptElement('S1/1', { checked: dp((vs1) => vs1.selected) }, []),
                        adoptText('S1/2', (vs1) => vs1.label),
                    ],
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
                ),
                adoptDynamicElement('S0/0/6', {}, [
                    hydrateForEach(
                        (vs: BooleanAttributesHeadlessViewState) => vs.ch?.interests?.options,
                        'id',
                        'S0/0/6/0',
                        (vs1: OptionOfInterestOfBooleanChoicesViewState) => [
                            adoptElement(
                                'S0/0/6/0',
                                { value: dp((vs1) => vs1.id), selected: ba((vs1) => vs1.selected) },
                                [],
                            ),
                        ],
                        (vs1: OptionOfInterestOfBooleanChoicesViewState) => {
                            return e(
                                'option',
                                { value: dp((vs1) => vs1.id), selected: ba((vs1) => vs1.selected) },
                                [dt((vs1) => vs1.label)],
                            );
                        },
                    ),
                ]),
            ]),
        ) as BooleanAttributesHeadlessElement;
    return [refManager.getPublicAPI() as BooleanAttributesHeadlessElementRefs, render];
}
