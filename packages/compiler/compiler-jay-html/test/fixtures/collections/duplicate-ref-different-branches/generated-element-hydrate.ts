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
export type DuplicateRefDifferentBranchesFastViewState = {};
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
            adoptElement('0', {}, [
                adoptText('1', (vs) => vs.title),
                adoptElement('2', {}, [
                    hydrateForEach(
                        '2',
                        (vs: DuplicateRefDifferentBranchesViewState) => vs.items,
                        'id',
                        () => [
                            adoptText('name', (vs1) => vs1.name, refName()),
                            adoptElement('deleteButton', {}, [], refDeleteButton()),
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
                        adoptElement('3', {}, [
                            adoptElement('deleteButton', {}, [], refDeleteButton2()),
                        ]),
                ),
            ]),
        ) as DuplicateRefDifferentBranchesElement;
    return [refManager.getPublicAPI() as DuplicateRefDifferentBranchesElementRefs, render];
}
