import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateConditional,
    hydrateForEach,
    adoptDynamicElement,
} from '@jay-framework/runtime';

export interface ItemOfDuplicateRefDifferentBranchesViewState {
    name: string;
    id: string;
}

export interface DuplicateRefDifferentBranchesViewState {
    title: string;
    items: Array<ItemOfDuplicateRefDifferentBranchesViewState>;
    showGlobalDelete: boolean;
}

export interface DuplicateRefDifferentBranchesElementRefs {
    deleteButton: HTMLElementProxy<DuplicateRefDifferentBranchesViewState, HTMLButtonElement>;
    items: {
        name: HTMLElementCollectionProxy<
            ItemOfDuplicateRefDifferentBranchesViewState,
            HTMLSpanElement
        >;
        deleteButton: HTMLElementCollectionProxy<
            ItemOfDuplicateRefDifferentBranchesViewState,
            HTMLButtonElement
        >;
    };
}

export type DuplicateRefDifferentBranchesSlowViewState = {};
export type DuplicateRefDifferentBranchesFastViewState = DuplicateRefDifferentBranchesViewState;
export type DuplicateRefDifferentBranchesInteractiveViewState =
    DuplicateRefDifferentBranchesViewState;

export type DuplicateRefDifferentBranchesElement = JayElement<
    DuplicateRefDifferentBranchesViewState,
    DuplicateRefDifferentBranchesElementRefs
>;
export type DuplicateRefDifferentBranchesElementRender = RenderElement<
    DuplicateRefDifferentBranchesViewState,
    DuplicateRefDifferentBranchesElementRefs,
    DuplicateRefDifferentBranchesElement
>;
export type DuplicateRefDifferentBranchesElementPreRender = [
    DuplicateRefDifferentBranchesElementRefs,
    DuplicateRefDifferentBranchesElementRender,
];
export type DuplicateRefDifferentBranchesContract = JayContract<
    DuplicateRefDifferentBranchesViewState,
    DuplicateRefDifferentBranchesElementRefs,
    DuplicateRefDifferentBranchesSlowViewState,
    DuplicateRefDifferentBranchesFastViewState,
    DuplicateRefDifferentBranchesInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): DuplicateRefDifferentBranchesElementPreRender {
    const [itemsRefManager, [refName, refDeleteButton]] = ReferencesManager.for(
        options,
        [],
        ['name', 'deleteButton'],
        [],
        [],
    );
    const [refManager, [refDeleteButton2]] = ReferencesManager.for(
        options,
        ['deleteButton'],
        [],
        [],
        [],
        {
            items: itemsRefManager,
        },
    );
    const render = (viewState: DuplicateRefDifferentBranchesViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptDynamicElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.title),
                adoptDynamicElement('S0/0/1', {}, [
                    hydrateForEach(
                        (vs: DuplicateRefDifferentBranchesViewState) => vs.items,
                        'id',
                        'S0/0/1/0',
                        () => [
                            adoptText('S1/0', (vs1) => vs1.name, refName()),
                            adoptElement('S1/1', {}, [], refDeleteButton()),
                        ],
                        (vs1: ItemOfDuplicateRefDifferentBranchesViewState) => {
                            return e('div', {}, [
                                e('span', {}, [dt((vs1) => vs1.name)], refName()),
                                e('button', {}, ['Delete Item'], refDeleteButton()),
                            ]);
                        },
                    ),
                ]),
                hydrateConditional(
                    (vs) => vs.showGlobalDelete,
                    () =>
                        adoptElement('S0/0/2', {}, [
                            adoptElement('S0/0/2/0', {}, [], refDeleteButton2()),
                        ]),
                    () => e('div', {}, [e('button', {}, ['Delete All'], refDeleteButton2())]),
                ),
            ]),
        ) as DuplicateRefDifferentBranchesElement;
    return [refManager.getPublicAPI() as DuplicateRefDifferentBranchesElementRefs, render];
}
