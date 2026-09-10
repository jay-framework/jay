import { HTMLElementCollectionProxy, HTMLElementProxy, JayContract } from '@jay-framework/runtime';

export enum Status {
    success,
    warning,
    error,
}

export interface WidgetViewState {
    label: string;
    status: Status;
    count: number;
    active: boolean;
}

export type WidgetSlowViewState = Pick<WidgetViewState, 'label'>;

export type WidgetFastViewState = Pick<WidgetViewState, 'status' | 'count' | 'active'>;

export type WidgetInteractiveViewState = Pick<WidgetViewState, 'status' | 'count'>;

export interface WidgetRefs {
    bump: HTMLElementProxy<WidgetViewState, HTMLButtonElement>;
}

export interface WidgetRepeatedRefs {
    bump: HTMLElementCollectionProxy<WidgetViewState, HTMLButtonElement>;
}

export interface WidgetProps {
    itemId: string;
    status: Status;
    count: number;
    active: boolean;
}

export type WidgetContract = JayContract<
    WidgetViewState,
    WidgetRefs,
    WidgetSlowViewState,
    WidgetFastViewState,
    WidgetInteractiveViewState,
    WidgetProps
>;
