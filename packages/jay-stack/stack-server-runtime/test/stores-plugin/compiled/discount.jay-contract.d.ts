import {JayContract, JayElement, RenderElement, RenderElementOptions} from '@jay-framework/runtime';

export enum Type {
    amount,
    percent,
}

export interface DiscountViewState {
    type: Type;
    value: number;
}

export interface DiscountRefs {}

export interface DiscountRepeatedRefs {}

export type DiscountSlowViewState = Pick<DiscountViewState, 'type' | 'value'>;
export type DiscountFastViewState = {};
export type DiscountInteractiveViewState = {};

export type DiscountContract = JayContract<
    DiscountViewState,
    DiscountRefs,
    DiscountSlowViewState,
    DiscountFastViewState,
    DiscountInteractiveViewState>;

