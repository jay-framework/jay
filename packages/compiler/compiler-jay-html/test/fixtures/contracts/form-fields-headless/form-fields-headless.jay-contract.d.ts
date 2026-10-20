import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export interface FirstNameOfFormFieldsViewState {}

export interface EmailOfFormFieldsViewState {}

export interface MessageOfFormFieldsViewState {}

export interface FormFieldsViewState {
    firstName: FirstNameOfFormFieldsViewState;
    email: EmailOfFormFieldsViewState;
    message: MessageOfFormFieldsViewState;
}

export type FormFieldsSlowViewState = {};

export type FormFieldsFastViewState = {};

export type FormFieldsInteractiveViewState = {};

export interface FormFieldsRefs {
    firstName: {
        input: HTMLElementProxy<FirstNameOfFormFieldsViewState, HTMLInputElement>;
    };
    email: {
        input: HTMLElementProxy<EmailOfFormFieldsViewState, HTMLInputElement>;
    };
    message: {
        input: HTMLElementProxy<MessageOfFormFieldsViewState, HTMLTextAreaElement>;
    };
}

export interface FormFieldsRepeatedRefs {
    firstName: {
        input: HTMLElementCollectionProxy<FirstNameOfFormFieldsViewState, HTMLInputElement>;
    };
    email: {
        input: HTMLElementCollectionProxy<EmailOfFormFieldsViewState, HTMLInputElement>;
    };
    message: {
        input: HTMLElementCollectionProxy<MessageOfFormFieldsViewState, HTMLTextAreaElement>;
    };
}

export type FormFieldsContract = JayContract<
    FormFieldsViewState,
    FormFieldsRefs,
    FormFieldsSlowViewState,
    FormFieldsFastViewState,
    FormFieldsInteractiveViewState
>;
