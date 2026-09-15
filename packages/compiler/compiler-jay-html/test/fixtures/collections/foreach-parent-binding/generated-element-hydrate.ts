import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
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

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ForeachParentBindingElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ForeachParentBindingViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                hydrateForEach(
                    (vs: ForeachParentBindingViewState) => vs.items,
                    'id',
                    'S0/0/0',
                    (vs1: ItemOfForeachParentBindingViewState) => [
                        adoptElement('S0/0/0', { 'data-group': da((vs1, _p1) => _p1.listTitle) }, [
                            adoptText('S1/0', (vs1) => vs1.name),
                            adoptText('S1/1', (vs1, _p1) => _p1.listTitle),
                        ]),
                    ],
                    (vs1: ItemOfForeachParentBindingViewState) => {
                        return e('li', { 'data-group': da((vs1, _p1) => _p1.listTitle) }, [
                            e('span', { class: 'name' }, [dt((vs1) => vs1.name)]),
                            e('span', { class: 'title' }, [dt((vs1, _p1) => _p1.listTitle)]),
                        ]);
                    },
                    true,
                ),
            ]),
        ) as ForeachParentBindingElement;
    return [refManager.getPublicAPI() as ForeachParentBindingElementRefs, render];
}
