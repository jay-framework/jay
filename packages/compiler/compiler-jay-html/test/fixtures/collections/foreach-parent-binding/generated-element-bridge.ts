import { JayElement, RenderElement, JayContract } from '@jay-framework/runtime';
import {
    SecureReferencesManager,
    elementBridge,
    sandboxForEach as forEach,
} from '@jay-framework/secure';

export interface ItemOfForeachParentBindingViewState {
    name: string;
    id: string;
}

export interface ForeachParentBindingViewState {
    listTitle: string;
    items: Array<ItemOfForeachParentBindingViewState>;
}

export interface ForeachParentBindingElementRefs {}

export type ForeachParentBindingSlowViewState = {};
export type ForeachParentBindingFastViewState = ForeachParentBindingViewState;
export type ForeachParentBindingInteractiveViewState = ForeachParentBindingViewState;

export type ForeachParentBindingElement = JayElement<
    ForeachParentBindingViewState,
    ForeachParentBindingElementRefs
>;
export type ForeachParentBindingElementRender = RenderElement<
    ForeachParentBindingViewState,
    ForeachParentBindingElementRefs,
    ForeachParentBindingElement
>;
export type ForeachParentBindingElementPreRender = [
    ForeachParentBindingElementRefs,
    ForeachParentBindingElementRender,
];
export type ForeachParentBindingContract = JayContract<
    ForeachParentBindingViewState,
    ForeachParentBindingElementRefs,
    ForeachParentBindingSlowViewState,
    ForeachParentBindingFastViewState,
    ForeachParentBindingInteractiveViewState
>;

export function render(): ForeachParentBindingElementPreRender {
    const [refManager, []] = SecureReferencesManager.forElement([], [], [], []);
    const render = (viewState: ForeachParentBindingViewState) =>
        elementBridge(viewState, refManager, () => [
            forEach(
                (vs: ForeachParentBindingViewState) => vs.items,
                'id',
                () => [],
            ),
        ]) as ForeachParentBindingElement;
    return [refManager.getPublicAPI() as ForeachParentBindingElementRefs, render];
}
