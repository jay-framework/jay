import {
    BaseJayElement,
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    withData,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface TreeOfIndirectRecursion2ViewState {
    id: string;
    name: string;
    hasChildren: boolean;
    isOpen: boolean;
    children: Array<TreeOfIndirectRecursion2ViewState>;
}

export interface IndirectRecursion2ViewState {
    tree: Array<TreeOfIndirectRecursion2ViewState>;
}

export interface IndirectRecursion2ElementRefs {
    tree: {
        menuItemName: HTMLElementCollectionProxy<
            TreeOfIndirectRecursion2ViewState,
            HTMLSpanElement
        >;
        menuItem: HTMLElementProxy<Array<TreeOfIndirectRecursion2ViewState>, HTMLUListElement>;
    };
}

export type IndirectRecursion2SlowViewState = {};
export type IndirectRecursion2FastViewState = {};
export type IndirectRecursion2InteractiveViewState = IndirectRecursion2ViewState;

export type IndirectRecursion2Element = JayElement<
    IndirectRecursion2ViewState,
    IndirectRecursion2ElementRefs
>;
export type IndirectRecursion2ElementRender = RenderElement<
    IndirectRecursion2ViewState,
    IndirectRecursion2ElementRefs,
    IndirectRecursion2Element
>;
export type IndirectRecursion2ElementPreRender = [
    IndirectRecursion2ElementRefs,
    IndirectRecursion2ElementRender,
];
export type IndirectRecursion2Contract = JayContract<
    IndirectRecursion2ViewState,
    IndirectRecursion2ElementRefs,
    IndirectRecursion2SlowViewState,
    IndirectRecursion2FastViewState,
    IndirectRecursion2InteractiveViewState
>;

export function render(options?: RenderElementOptions): IndirectRecursion2ElementPreRender {
    const [treeRefManager, [refMenuItem, refMenuItemName]] = ReferencesManager.for(
        options,
        ['menuItem'],
        ['menuItemName'],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        tree: treeRefManager,
    });

    function renderRecursiveRegion_menuItem(): BaseJayElement<
        Array<TreeOfIndirectRecursion2ViewState>
    > {
        return de(
            'ul',
            { class: 'menu-list' },
            [
                forEach(
                    (vs1: Array<TreeOfIndirectRecursion2ViewState>) => vs1,
                    (vs2: TreeOfIndirectRecursion2ViewState) => {
                        return de('li', {}, [
                            e('a', { href: '#' }, [
                                e(
                                    'span',
                                    { class: 'name' },
                                    [dt((vs2) => vs2.name)],
                                    refMenuItemName(),
                                ),
                            ]),
                            c(
                                (vs2) => vs2.hasChildren && vs2.isOpen,
                                () =>
                                    de('div', {}, [
                                        withData(
                                            (vs2) => vs2.children,
                                            () => renderRecursiveRegion_menuItem(),
                                        ),
                                    ]),
                            ),
                        ]);
                    },
                    'id',
                ),
            ],
            refMenuItem(),
        );
    }

    const render = (viewState: IndirectRecursion2ViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('nav', { class: 'menu' }, [
                withData(
                    (vs: IndirectRecursion2ViewState) => vs.tree,
                    () => renderRecursiveRegion_menuItem(),
                ),
            ]),
        ) as IndirectRecursion2Element;
    return [refManager.getPublicAPI() as IndirectRecursion2ElementRefs, render];
}
