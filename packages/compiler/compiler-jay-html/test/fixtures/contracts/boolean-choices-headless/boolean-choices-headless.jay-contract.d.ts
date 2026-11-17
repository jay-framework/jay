import { JayContract } from '@jay-framework/runtime';

export interface OptionOfInterestOfBooleanChoicesViewState {
    id: string;
    label: string;
    selected: boolean;
}

export interface InterestOfBooleanChoicesViewState {
    options: Array<OptionOfInterestOfBooleanChoicesViewState>;
}

export interface BooleanChoicesViewState {
    accepted: boolean;
    interests: InterestOfBooleanChoicesViewState;
}

export type BooleanChoicesSlowViewState = {};

export type BooleanChoicesFastViewState = Pick<BooleanChoicesViewState, 'accepted'> & {
    interests: BooleanChoicesViewState['interests'];
};

export type BooleanChoicesInteractiveViewState = Pick<BooleanChoicesViewState, 'accepted'> & {
    interests: BooleanChoicesViewState['interests'];
};

export interface BooleanChoicesRefs {}

export interface BooleanChoicesRepeatedRefs {}

export type BooleanChoicesContract = JayContract<
    BooleanChoicesViewState,
    BooleanChoicesRefs,
    BooleanChoicesSlowViewState,
    BooleanChoicesFastViewState,
    BooleanChoicesInteractiveViewState
>;
