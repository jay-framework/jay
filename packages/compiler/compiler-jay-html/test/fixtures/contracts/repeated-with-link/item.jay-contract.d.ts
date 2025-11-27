import { JayContract } from '@jay-framework/runtime';

export interface ItemViewState {
    id: string;
    name: string;
    price: number;
}

export type ItemSlowViewState = {};

export type ItemFastViewState = {};

export type ItemInteractiveViewState = {};

export interface ItemRefs {}

export interface ItemRepeatedRefs {}

export type ItemContract = JayContract<
    ItemViewState,
    ItemRefs,
    ItemSlowViewState,
    ItemFastViewState,
    ItemInteractiveViewState
>;
