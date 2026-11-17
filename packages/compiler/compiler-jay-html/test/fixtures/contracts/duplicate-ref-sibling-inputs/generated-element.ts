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
    const [firstNameRefManager, [refInput]] = ReferencesManager.for(options, ['input'], [], [], []);
    const [emailRefManager, [refInput2]] = ReferencesManager.for(options, ['input'], [], [], []);
    const [messageRefManager, [refInput3]] = ReferencesManager.for(options, ['input'], [], [], []);
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
                e('input', {}, [], refInput()),
                e('input', {}, [], refInput2()),
                e('textarea', {}, [], refInput3()),
            ]),
        ) as DuplicateRefSiblingInputsElement;
    return [refManager.getPublicAPI() as DuplicateRefSiblingInputsElementRefs, render];
}
