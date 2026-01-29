import { HTMLElementCollectionProxy, JayContract } from '@jay-framework/runtime';

export interface RangeOfFilter1OfDuplicateRefHeadlessViewState {
    id: string;
}

export interface Filter1OfDuplicateRefHeadlessViewState {
    ranges: Array<RangeOfFilter1OfDuplicateRefHeadlessViewState>;
}

export interface CategoryOfFilter2OfDuplicateRefHeadlessViewState {
    id: string;
    name: string;
}

export interface Filter2OfDuplicateRefHeadlessViewState {
    categories: Array<CategoryOfFilter2OfDuplicateRefHeadlessViewState>;
}

export interface DuplicateRefHeadlessViewState {
    filter1: Filter1OfDuplicateRefHeadlessViewState;
    filter2: Filter2OfDuplicateRefHeadlessViewState;
}

export type DuplicateRefHeadlessSlowViewState = {
    filter2: DuplicateRefHeadlessViewState['filter2'];
};

export type DuplicateRefHeadlessFastViewState = {};

export type DuplicateRefHeadlessInteractiveViewState = {};

export interface DuplicateRefHeadlessRefs {
    filter1: {
        ranges: {
            isSelected: HTMLElementCollectionProxy<
                RangeOfFilter1OfDuplicateRefHeadlessViewState,
                HTMLInputElement
            >;
        };
    };
    filter2: {
        categories: {
            isSelected: HTMLElementCollectionProxy<
                CategoryOfFilter2OfDuplicateRefHeadlessViewState,
                HTMLInputElement
            >;
        };
    };
}

export interface DuplicateRefHeadlessRepeatedRefs {
    filter1: {
        ranges: {
            isSelected: HTMLElementCollectionProxy<
                RangeOfFilter1OfDuplicateRefHeadlessViewState,
                HTMLInputElement
            >;
        };
    };
    filter2: {
        categories: {
            isSelected: HTMLElementCollectionProxy<
                CategoryOfFilter2OfDuplicateRefHeadlessViewState,
                HTMLInputElement
            >;
        };
    };
}

export type DuplicateRefHeadlessContract = JayContract<
    DuplicateRefHeadlessViewState,
    DuplicateRefHeadlessRefs,
    DuplicateRefHeadlessSlowViewState,
    DuplicateRefHeadlessFastViewState,
    DuplicateRefHeadlessInteractiveViewState
>;
