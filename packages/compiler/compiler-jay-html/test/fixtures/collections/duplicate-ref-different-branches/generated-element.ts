import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
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

export function render(
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
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                de('div', {}, [
                    forEach(
                        (vs: DuplicateRefDifferentBranchesViewState) => vs.items,
                        (vs1: ItemOfDuplicateRefDifferentBranchesViewState) => {
                            return e('div', {}, [
                                e('span', {}, [dt((vs1) => vs1.name)], refName()),
                                e('button', {}, ['Delete Item'], refDeleteButton()),
                            ]);
                        },
                        'id',
                    ),
                ]),
                c(
                    (vs) => vs.showGlobalDelete,
                    () => e('div', {}, [e('button', {}, ['Delete All'], refDeleteButton2())]),
                ),
            ]),
        ) as DuplicateRefDifferentBranchesElement;
    return [
        refManager.getPublicAPI() as DuplicateRefDifferentBranchesElementRefs,
        render,
    ];
}
