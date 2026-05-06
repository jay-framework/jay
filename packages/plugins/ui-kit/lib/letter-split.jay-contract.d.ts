import {JayContract} from "@jay-framework/runtime";


export interface LetterOfLetterSplitViewState {
  index: number,
  text: string
}

export interface LetterSplitViewState {
  letters: Array<LetterOfLetterSplitViewState>
}

export type LetterSplitSlowViewState = {};

export type LetterSplitFastViewState = {
    letters: Array<LetterSplitViewState['letters'][number]>;
};

export type LetterSplitInteractiveViewState = {
    letters: Array<LetterSplitViewState['letters'][number]>;
};

export interface LetterSplitRefs {}

export interface LetterSplitRepeatedRefs {}

export interface LetterSplitProps {
  text?: string;
}

export type LetterSplitContract = JayContract<LetterSplitViewState, LetterSplitRefs, LetterSplitSlowViewState, LetterSplitFastViewState, LetterSplitInteractiveViewState, LetterSplitProps>