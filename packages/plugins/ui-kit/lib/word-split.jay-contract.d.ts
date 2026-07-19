import { JayContract } from '@jay-framework/runtime';

export interface WordOfWordSplitViewState {
    index: number;
    text: string;
}

export interface WordSplitViewState {
    words: Array<WordOfWordSplitViewState>;
}

export type WordSplitSlowViewState = {};

export type WordSplitFastViewState = {
    words: Array<WordSplitViewState['words'][number]>;
};

export type WordSplitInteractiveViewState = {
    words: Array<WordSplitViewState['words'][number]>;
};

export interface WordSplitRefs {}

export interface WordSplitRepeatedRefs {}

export interface WordSplitProps {
    text?: string;
}

export type WordSplitContract = JayContract<
    WordSplitViewState,
    WordSplitRefs,
    WordSplitSlowViewState,
    WordSplitFastViewState,
    WordSplitInteractiveViewState,
    WordSplitProps
>;
