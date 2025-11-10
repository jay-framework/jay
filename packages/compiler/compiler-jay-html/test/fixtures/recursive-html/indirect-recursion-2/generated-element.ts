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
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface TreeOfIndirectRecursion2ViewState {
    id: string;
    name: string;
    hasChildren: boolean;
    isOpen: boolean;
    children: Array<TreeOfIndirectRecursion2ViewState> | null;
}

export interface IndirectRecursion2ViewState {
    tree: Array<TreeOfIndirectRecursion2ViewState>;
}

export interface IndirectRecursion2ElementRefs {
    menuItem: HTMLElementProxy<Array<TreeOfIndirectRecursion2ViewState>, HTMLUListElement>;
}

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
    IndirectRecursion2ElementRefs
>;

export function render(options?: RenderElementOptions): IndirectRecursion2ElementPreRender {
    const [refManager, [refMenuItem]] = ReferencesManager.for(options, ['menuItem'], [], [], []);

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
                                e('span', { class: 'name' }, [dt((vs2) => vs2.name)]),
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
