import {
    BaseJayElement,
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export enum TypeOfTreeWithConditionalViewState {
    file,
    folder,
}

export interface TreeWithConditionalViewState {
    name: string;
    id: string;
    type: TypeOfTreeWithConditionalViewState;
    isExpanded: boolean;
    children: Array<TreeWithConditionalViewState>;
}

export interface TreeWithConditionalElementRefs {
    itemHeader: HTMLElementProxy<TreeWithConditionalViewState, HTMLDivElement>;
    treeItem: HTMLElementProxy<TreeWithConditionalViewState, HTMLDivElement>;
}

export type TreeWithConditionalSlowViewState = {};
export type TreeWithConditionalFastViewState = {};
export type TreeWithConditionalInteractiveViewState = TreeWithConditionalViewState;

export type TreeWithConditionalElement = JayElement<
    TreeWithConditionalViewState,
    TreeWithConditionalElementRefs
>;
export type TreeWithConditionalElementRender = RenderElement<
    TreeWithConditionalViewState,
    TreeWithConditionalElementRefs,
    TreeWithConditionalElement
>;
export type TreeWithConditionalElementPreRender = [
    TreeWithConditionalElementRefs,
    TreeWithConditionalElementRender,
];
export type TreeWithConditionalContract = JayContract<
    TreeWithConditionalViewState,
    TreeWithConditionalElementRefs,
    TreeWithConditionalSlowViewState,
    TreeWithConditionalFastViewState,
    TreeWithConditionalInteractiveViewState
>;

export function render(options?: RenderElementOptions): TreeWithConditionalElementPreRender {
    const [childrenRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [refManager, [refItemHeader, refTreeItem]] = ReferencesManager.for(
        options,
        ['itemHeader', 'treeItem'],
        [],
        [],
        [],
        {
            children: childrenRefManager,
        },
    );

    function renderRecursiveRegion_treeItem(): BaseJayElement<TreeWithConditionalViewState> {
        return de(
            'div',
            { class: 'tree-item' },
            [
                e(
                    'div',
                    { class: 'item-header' },
                    [
                        e('span', { class: 'icon' }, [dt((vs) => vs.type)]),
                        e('span', { class: 'name' }, [dt((vs) => vs.name)]),
                    ],
                    refItemHeader(),
                ),
                c(
                    (vs) => vs.type === TypeOfTreeWithConditionalViewState.folder,
                    () =>
                        de('div', {}, [
                            c(
                                (vs) => vs.isExpanded,
                                () =>
                                    de('div', { class: 'children' }, [
                                        forEach(
                                            (vs: TreeWithConditionalViewState) => vs.children,
                                            (vs1: TreeWithConditionalViewState) => {
                                                return e('div', {}, [
                                                    renderRecursiveRegion_treeItem(),
                                                ]);
                                            },
                                            'id',
                                        ),
                                    ]),
                            ),
                        ]),
                ),
            ],
            refTreeItem(),
        );
    }

    const render = (viewState: TreeWithConditionalViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'file-tree' }, [renderRecursiveRegion_treeItem()]),
        ) as TreeWithConditionalElement;
    return [refManager.getPublicAPI() as TreeWithConditionalElementRefs, render];
}
