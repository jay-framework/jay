import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';

export interface ItemOfForeachDynamicClassViewState {
    name: string;
    isActive: boolean;
    id: string;
}

export interface ForeachDynamicClassViewState {
    items: Array<ItemOfForeachDynamicClassViewState>;
}

export interface ForeachDynamicClassElementRefs {
    items: {
        itemsSelected: HTMLElementCollectionProxy<
            ItemOfForeachDynamicClassViewState,
            HTMLDivElement
        >;
    };
}

export type ForeachDynamicClassSlowViewState = {};
export type ForeachDynamicClassFastViewState = ForeachDynamicClassViewState;
export type ForeachDynamicClassInteractiveViewState = ForeachDynamicClassViewState;

export type ForeachDynamicClassElement = JayElement<
    ForeachDynamicClassViewState,
    ForeachDynamicClassElementRefs
>;
export type ForeachDynamicClassElementRender = RenderElement<
    ForeachDynamicClassViewState,
    ForeachDynamicClassElementRefs,
    ForeachDynamicClassElement
>;
export type ForeachDynamicClassElementPreRender = [
    ForeachDynamicClassElementRefs,
    ForeachDynamicClassElementRender,
];
export type ForeachDynamicClassContract = JayContract<
    ForeachDynamicClassViewState,
    ForeachDynamicClassElementRefs,
    ForeachDynamicClassSlowViewState,
    ForeachDynamicClassFastViewState,
    ForeachDynamicClassInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): ForeachDynamicClassElementPreRender {
    const [itemsRefManager, [refItemsSelected]] = ReferencesManager.for(
        options,
        [],
        ['itemsSelected'],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState: ForeachDynamicClassViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('0', {}, [
                hydrateForEach(
                    (vs: ForeachDynamicClassViewState) => vs.items,
                    'id',
                    () => [
                        adoptElement(
                            '',
                            { class: da((vs1) => `item ${vs1.isActive ? 'active' : ''}`) },
                            [adoptText('0', (vs1) => vs1.name)],
                            refItemsSelected(),
                        ),
                    ],
                    (vs1: ItemOfForeachDynamicClassViewState) => {
                        return e(
                            'div',
                            { class: da((vs1) => `item ${vs1.isActive ? 'active' : ''}`) },
                            [e('span', {}, [dt((vs1) => vs1.name)])],
                            refItemsSelected(),
                        );
                    },
                ),
            ]),
        ) as ForeachDynamicClassElement;
    return [refManager.getPublicAPI() as ForeachDynamicClassElementRefs, render];
}
