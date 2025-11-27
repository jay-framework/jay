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

export interface SimpleTreeViewState {
    name: string;
    id: string;
    open: boolean;
    children: Array<SimpleTreeViewState>;
}

export interface SimpleTreeElementRefs {
    nodeHeader: HTMLElementProxy<SimpleTreeViewState, HTMLDivElement>;
    treeNode: HTMLElementProxy<SimpleTreeViewState, HTMLDivElement>;
}

export type SimpleTreeSlowViewState = {};
export type SimpleTreeFastViewState = {};
export type SimpleTreeInteractiveViewState = SimpleTreeViewState;

export type SimpleTreeElement = JayElement<SimpleTreeViewState, SimpleTreeElementRefs>;
export type SimpleTreeElementRender = RenderElement<
    SimpleTreeViewState,
    SimpleTreeElementRefs,
    SimpleTreeElement
>;
export type SimpleTreeElementPreRender = [SimpleTreeElementRefs, SimpleTreeElementRender];
export type SimpleTreeContract = JayContract<
    SimpleTreeViewState,
    SimpleTreeElementRefs,
    SimpleTreeSlowViewState,
    SimpleTreeFastViewState,
    SimpleTreeInteractiveViewState
>;

export function render(options?: RenderElementOptions): SimpleTreeElementPreRender {
    const [childrenRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [refManager, [refNodeHeader, refTreeNode]] = ReferencesManager.for(
        options,
        ['nodeHeader', 'treeNode'],
        [],
        [],
        [],
        {
            children: childrenRefManager,
        },
    );

    function renderRecursiveRegion_treeNode(): BaseJayElement<SimpleTreeViewState> {
        return de(
            'div',
            { class: 'tree-node' },
            [
                e(
                    'div',
                    { class: 'node-header' },
                    [e('span', {}, [dt((vs) => vs.name)])],
                    refNodeHeader(),
                ),
                c(
                    (vs) => vs.open,
                    () =>
                        de('ul', {}, [
                            forEach(
                                (vs: SimpleTreeViewState) => vs.children,
                                (vs1: SimpleTreeViewState) => {
                                    return e('li', {}, [renderRecursiveRegion_treeNode()]);
                                },
                                'id',
                            ),
                        ]),
                ),
            ],
            refTreeNode(),
        );
    }

    const render = (viewState: SimpleTreeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'tree-container' }, [
                e('h1', {}, ['File Browser']),
                renderRecursiveRegion_treeNode(),
            ]),
        ) as SimpleTreeElement;
    return [refManager.getPublicAPI() as SimpleTreeElementRefs, render];
}
