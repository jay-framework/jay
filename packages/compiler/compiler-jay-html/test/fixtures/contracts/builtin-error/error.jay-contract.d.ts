import { JayContract } from '@jay-framework/runtime';

export interface DetailOfErrorViewState {
    key: string;
    value: string;
}

export interface ErrorViewState {
    status: number;
    title: string;
    message: string;
    url: string;
    code: string;
    details: Array<DetailOfErrorViewState>;
}

export type ErrorSlowViewState = {};

export type ErrorFastViewState = Pick<
    ErrorViewState,
    'status' | 'title' | 'message' | 'url' | 'code'
> & {
    details: Array<ErrorViewState['details'][number]>;
};

export type ErrorInteractiveViewState = {};

export interface ErrorRefs {}

export interface ErrorRepeatedRefs {}

export type ErrorContract = JayContract<
    ErrorViewState,
    ErrorRefs,
    ErrorSlowViewState,
    ErrorFastViewState,
    ErrorInteractiveViewState
>;
