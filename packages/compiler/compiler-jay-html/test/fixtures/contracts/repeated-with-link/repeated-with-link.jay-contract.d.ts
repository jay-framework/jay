import { JayContract } from '@jay-framework/runtime';
import { ItemViewState, ItemRefs, ItemRepeatedRefs } from './item.jay-contract';

export interface ItemOfRepeatedWithLinkViewState {
    product: ItemViewState;
    quantity: number;
}

export interface RepeatedWithLinkViewState {
    title: string;
    items: Array<ItemOfRepeatedWithLinkViewState>;
}

export type RepeatedWithLinkSlowViewState = Pick<RepeatedWithLinkViewState, 'title'>;

export type RepeatedWithLinkFastViewState = {
    items: Array<RepeatedWithLinkViewState['items'][number]>;
};

export type RepeatedWithLinkInteractiveViewState = {};

export interface RepeatedWithLinkRefs {
    items: {
        product: ItemRefs;
    };
}

export interface RepeatedWithLinkRepeatedRefs {
    items: {
        product: ItemRepeatedRefs;
    };
}

export type RepeatedWithLinkContract = JayContract<
    RepeatedWithLinkViewState,
    RepeatedWithLinkRefs,
    RepeatedWithLinkSlowViewState,
    RepeatedWithLinkFastViewState,
    RepeatedWithLinkInteractiveViewState
>;
