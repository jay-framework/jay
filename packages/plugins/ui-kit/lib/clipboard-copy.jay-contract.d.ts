import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface ClipboardCopyViewState {
  text: string,
  copied: boolean
}

export type ClipboardCopySlowViewState = {};

export type ClipboardCopyFastViewState = Pick<ClipboardCopyViewState, 'text' | 'copied'>;

export type ClipboardCopyInteractiveViewState = Pick<ClipboardCopyViewState, 'text' | 'copied'>;


export interface ClipboardCopyRefs {
  copyBtn: HTMLElementProxy<ClipboardCopyViewState, HTMLButtonElement>
}


export interface ClipboardCopyRepeatedRefs {
  copyBtn: HTMLElementCollectionProxy<ClipboardCopyViewState, HTMLButtonElement>
}

export interface ClipboardCopyProps {
  text?: string;
}

export type ClipboardCopyContract = JayContract<ClipboardCopyViewState, ClipboardCopyRefs, ClipboardCopySlowViewState, ClipboardCopyFastViewState, ClipboardCopyInteractiveViewState, ClipboardCopyProps>