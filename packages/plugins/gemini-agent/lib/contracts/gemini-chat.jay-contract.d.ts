import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export enum Role {
  user,
  assistant
}

export interface MessageOfGeminiChatViewState {
  index: number,
  role: Role,
  content: string
}

export interface GeminiChatViewState {
  messages: Array<MessageOfGeminiChatViewState>,
  lastUserMessage: string,
  lastAssistantMessage: string,
  messageInput: string,
  isLoading: boolean,
  isExpanded: boolean,
  hasError: boolean,
  hasMessages: boolean,
  errorMessage: string
}

export type GeminiChatSlowViewState = {};

export type GeminiChatFastViewState = Pick<GeminiChatViewState, 'lastUserMessage' | 'lastAssistantMessage' | 'messageInput' | 'isLoading' | 'isExpanded' | 'hasError' | 'hasMessages' | 'errorMessage'> & {
    messages: Array<GeminiChatViewState['messages'][number]>;
};

export type GeminiChatInteractiveViewState = Pick<GeminiChatViewState, 'lastUserMessage' | 'lastAssistantMessage' | 'messageInput' | 'isLoading' | 'isExpanded' | 'hasError' | 'hasMessages' | 'errorMessage'> & {
    messages: Array<GeminiChatViewState['messages'][number]>;
};


export interface GeminiChatRefs {
  messageInput: HTMLElementProxy<GeminiChatViewState, HTMLInputElement>,
  sendMessage: HTMLElementProxy<GeminiChatViewState, HTMLButtonElement>,
  toggleExpand: HTMLElementProxy<GeminiChatViewState, HTMLButtonElement>
}


export interface GeminiChatRepeatedRefs {
  messageInput: HTMLElementCollectionProxy<GeminiChatViewState, HTMLInputElement>,
  sendMessage: HTMLElementCollectionProxy<GeminiChatViewState, HTMLButtonElement>,
  toggleExpand: HTMLElementCollectionProxy<GeminiChatViewState, HTMLButtonElement>
}

export type GeminiChatContract = JayContract<GeminiChatViewState, GeminiChatRefs, GeminiChatSlowViewState, GeminiChatFastViewState, GeminiChatInteractiveViewState>