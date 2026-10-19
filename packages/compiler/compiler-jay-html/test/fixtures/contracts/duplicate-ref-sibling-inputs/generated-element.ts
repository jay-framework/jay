import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import {
    FormFieldsViewState,
    FormFieldsRefs,
} from '../form-fields-headless/form-fields-headless.jay-contract';

export interface DuplicateRefSiblingInputsViewState {
    form?: FormFieldsViewState;
    title: string;
}

export interface DuplicateRefSiblingInputsElementRefs {
    form: FormFieldsRefs;
}

export type DuplicateRefSiblingInputsSlowViewState = {};
export type DuplicateRefSiblingInputsFastViewState = DuplicateRefSiblingInputsViewState;
export type DuplicateRefSiblingInputsInteractiveViewState = DuplicateRefSiblingInputsViewState;

export type DuplicateRefSiblingInputsElement = JayElement<
    DuplicateRefSiblingInputsViewState,
    DuplicateRefSiblingInputsElementRefs
>;
export type DuplicateRefSiblingInputsElementRender = RenderElement<
    DuplicateRefSiblingInputsViewState,
    DuplicateRefSiblingInputsElementRefs,
    DuplicateRefSiblingInputsElement
>;
export type DuplicateRefSiblingInputsElementPreRender = [
    DuplicateRefSiblingInputsElementRefs,
    DuplicateRefSiblingInputsElementRender,
];
export type DuplicateRefSiblingInputsContract = JayContract<
    DuplicateRefSiblingInputsViewState,
    DuplicateRefSiblingInputsElementRefs,
    DuplicateRefSiblingInputsSlowViewState,
    DuplicateRefSiblingInputsFastViewState,
    DuplicateRefSiblingInputsInteractiveViewState
>;

export function render(options?: RenderElementOptions): DuplicateRefSiblingInputsElementPreRender {
    const [firstNameRefManager, [refFirstNameInput]] = ReferencesManager.for(options, ['input'], [], [], []);
    const [emailRefManager, [refEmailInput]] = ReferencesManager.for(options, ['input'], [], [], []);
    const [messageRefManager, [refMessageInput]] = ReferencesManager.for(options, ['input'], [], [], []);
    const [formRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        firstName: firstNameRefManager,
        email: emailRefManager,
        message: messageRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        form: formRefManager,
    });
    const render = (viewState: DuplicateRefSiblingInputsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('input', {}, [], refFirstNameInput()),
                e('input', {}, [], refEmailInput()),
                e('textarea', {}, [], refMessageInput()),
            ]),
        ) as DuplicateRefSiblingInputsElement;
    return [refManager.getPublicAPI() as DuplicateRefSiblingInputsElementRefs, render];
}
