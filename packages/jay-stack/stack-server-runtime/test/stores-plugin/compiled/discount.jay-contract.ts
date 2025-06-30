import { JayElement, RenderElement, RenderElementOptions } from '@jay-framework/runtime';

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

export type DiscountElement = JayElement<DiscountViewState, DiscountRefs>;
export type DiscountElementRender = RenderElement<DiscountViewState, DiscountRefs, DiscountElement>;
export type DiscountElementPreRender = [DiscountRefs, DiscountElementRender];

export declare function render(options?: RenderElementOptions): DiscountElementPreRender;
