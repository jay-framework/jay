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

export interface ReusedRefSameImportViewState {
    form?: FormFieldsViewState;
    title: string;
}

export interface ReusedRefSameImportElementRefs {
    form: FormFieldsRefs;
}

export type ReusedRefSameImportSlowViewState = {};
export type ReusedRefSameImportFastViewState = ReusedRefSameImportViewState;
export type ReusedRefSameImportInteractiveViewState = ReusedRefSameImportViewState;

export type ReusedRefSameImportElement = JayElement<
    ReusedRefSameImportViewState,
    ReusedRefSameImportElementRefs
>;
export type ReusedRefSameImportElementRender = RenderElement<
    ReusedRefSameImportViewState,
    ReusedRefSameImportElementRefs,
    ReusedRefSameImportElement
>;
export type ReusedRefSameImportElementPreRender = [
    ReusedRefSameImportElementRefs,
    ReusedRefSameImportElementRender,
];
export type ReusedRefSameImportContract = JayContract<
    ReusedRefSameImportViewState,
    ReusedRefSameImportElementRefs,
    ReusedRefSameImportSlowViewState,
    ReusedRefSameImportFastViewState,
    ReusedRefSameImportInteractiveViewState
>;

export function render(options?: RenderElementOptions): ReusedRefSameImportElementPreRender {
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
    const render = (viewState: ReusedRefSameImportViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                e('input', {}, [], refInput()),
                e('input', {}, [], refInput()),
            ]),
        ) as ReusedRefSameImportElement;
    return [refManager.getPublicAPI() as ReusedRefSameImportElementRefs, render];
}
