import {
    JayElement,
    RenderElement,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export enum ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState {
    state1,
    state2,
}

export interface SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState {
    id: string;
    subTitle: string;
}

export interface ItemOfNestedCollectionWithRefsInVariantsViewState {
    id: string;
    itemState: ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState;
    title: string;
    subItems: Array<SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState>;
}

export interface NestedCollectionWithRefsInVariantsViewState {
    items: Array<ItemOfNestedCollectionWithRefsInVariantsViewState>;
}

export interface NestedCollectionWithRefsInVariantsElementRefs {
    items: {
        subItems: {
            nestedRef: HTMLElementCollectionProxy<
                SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                HTMLDivElement
            >;
        };
    };
}

export type NestedCollectionWithRefsInVariantsSlowViewState = {};
export type NestedCollectionWithRefsInVariantsFastViewState = {};
export type NestedCollectionWithRefsInVariantsInteractiveViewState =
    NestedCollectionWithRefsInVariantsViewState;

export type NestedCollectionWithRefsInVariantsElement = JayElement<
    NestedCollectionWithRefsInVariantsViewState,
    NestedCollectionWithRefsInVariantsElementRefs
>;
export type NestedCollectionWithRefsInVariantsElementRender = RenderElement<
    NestedCollectionWithRefsInVariantsViewState,
    NestedCollectionWithRefsInVariantsElementRefs,
    NestedCollectionWithRefsInVariantsElement
>;
export type NestedCollectionWithRefsInVariantsElementPreRender = [
    NestedCollectionWithRefsInVariantsElementRefs,
    NestedCollectionWithRefsInVariantsElementRender,
];
export type NestedCollectionWithRefsInVariantsContract = JayContract<
    NestedCollectionWithRefsInVariantsViewState,
    NestedCollectionWithRefsInVariantsElementRefs,
    NestedCollectionWithRefsInVariantsSlowViewState,
    NestedCollectionWithRefsInVariantsFastViewState,
    NestedCollectionWithRefsInVariantsInteractiveViewState
>;

export declare function render(
    options?: RenderElementOptions,
): NestedCollectionWithRefsInVariantsElementPreRender;
