import {HTMLElementCollectionProxy, HTMLElementProxy, JayContract} from "@jay-framework/runtime";


export interface PopoverMenuViewState {}

export type PopoverMenuSlowViewState = {};

export type PopoverMenuFastViewState = {};

export type PopoverMenuInteractiveViewState = {};


export interface PopoverMenuRefs {
  trigger: HTMLElementProxy<PopoverMenuViewState, HTMLElement>,
  popover: HTMLElementProxy<PopoverMenuViewState, HTMLElement>
}


export interface PopoverMenuRepeatedRefs {
  trigger: HTMLElementCollectionProxy<PopoverMenuViewState, HTMLElement>,
  popover: HTMLElementCollectionProxy<PopoverMenuViewState, HTMLElement>
}

export type PopoverMenuContract = JayContract<PopoverMenuViewState, PopoverMenuRefs, PopoverMenuSlowViewState, PopoverMenuFastViewState, PopoverMenuInteractiveViewState>