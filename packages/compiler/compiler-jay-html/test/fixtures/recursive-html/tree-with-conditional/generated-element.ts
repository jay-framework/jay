import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    conditional as c,
    forEach,
    RenderElement,
    ReferencesManager,
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
}

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
    TreeWithConditionalElementRefs
>;

export function render(options?: RenderElementOptions): TreeWithConditionalElementPreRender {
    const [refManager, [refItemHeader]] = ReferencesManager.for(
        options,
        ['itemHeader'],
        [],
        [],
        [],
    );

    function renderRecursiveRegion_treeItem(itemData: TreeWithConditionalViewState) {
        return de('div', { class: 'tree-item' }, [
            e(
                'div',
                { class: 'item-header' },
                [
                    e('span', { class: 'icon' }, [dt((vs: TreeWithConditionalViewState) => vs.type)]),
                    e('span', { class: 'name' }, [dt((vs: TreeWithConditionalViewState) => vs.name)]),
                ],
                refItemHeader(),
            ),
            c(
                (vs: TreeWithConditionalViewState) => vs.type == TypeOfTreeWithConditionalViewState.folder && vs.isExpanded,
                () =>
                    de('div', { class: 'children' }, [
                        forEach(
                            (vs: TreeWithConditionalViewState) => vs.children,
                            (childData: TreeWithConditionalViewState) => {
                                return e('div', {}, [renderRecursiveRegion_treeItem(childData)]);
                            },
                            'id',
                        ),
                    ]),
            ),
        ]);
    }

    const render = (viewState: TreeWithConditionalViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'file-tree' }, [renderRecursiveRegion_treeItem(viewState)]),
        ) as TreeWithConditionalElement;

    return [refManager.getPublicAPI() as TreeWithConditionalElementRefs, render];
}

