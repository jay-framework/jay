import { JayContract } from '@jay-framework/runtime';

export enum Status {
    success,
    warning,
    error,
}

export interface BadgeViewState {
    label: string;
    status: Status;
    count: number;
    featured: boolean;
}

export type BadgeSlowViewState = Pick<BadgeViewState, 'label'>;

export type BadgeFastViewState = Pick<BadgeViewState, 'status' | 'count' | 'featured'>;

export type BadgeInteractiveViewState = {};

export interface BadgeRefs {}

export interface BadgeRepeatedRefs {}

export interface BadgeProps {
    label: string;
    status: Status;
    count: number;
    featured: boolean;
}

export type BadgeContract = JayContract<
    BadgeViewState,
    BadgeRefs,
    BadgeSlowViewState,
    BadgeFastViewState,
    BadgeInteractiveViewState,
    BadgeProps
>;
