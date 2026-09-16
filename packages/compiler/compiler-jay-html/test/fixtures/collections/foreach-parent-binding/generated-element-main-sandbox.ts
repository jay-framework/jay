import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

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

export function render(options?: RenderElementOptions): ForeachParentBindingElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ForeachParentBindingViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('ul', {}, [
                forEach(
                    (vs: ForeachParentBindingViewState) => vs.items,
                    (vs1: ItemOfForeachParentBindingViewState) => {
                        return e('li', { 'data-group': da((vs1, _p1) => _p1.listTitle) }, [
                            e('span', { class: 'name' }, [dt((vs1) => vs1.name)]),
                            e('span', { class: 'title' }, [dt((vs1, _p1) => _p1.listTitle)]),
                        ]);
                    },
                    'id',
                    true,
                ),
            ]),
        ) as ForeachParentBindingElement;
    return [refManager.getPublicAPI() as ForeachParentBindingElementRefs, render];
}
