import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';
import {
    FormFieldsViewState,
    FormFieldsRefs,
    FirstNameOfFormFieldsViewState,
    EmailOfFormFieldsViewState,
    MessageOfFormFieldsViewState,
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): DuplicateRefSiblingInputsElementPreRender {
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
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                adoptElement('S0/0/1', {}, [], refInput()),
                adoptElement('S0/0/2', {}, [], refInput2()),
                adoptElement('S0/0/3', {}, [], refInput3()),
            ]),
        ) as DuplicateRefSiblingInputsElement;
    return [refManager.getPublicAPI() as DuplicateRefSiblingInputsElementRefs, render];
}
