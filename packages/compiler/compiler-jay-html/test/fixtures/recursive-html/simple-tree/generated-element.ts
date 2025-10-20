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

export interface SimpleTreeViewState {
    name: string;
    id: string;
    open: boolean;
    children: Array<SimpleTreeViewState>;
}

export interface SimpleTreeElementRefs {
    nodeHeader: HTMLElementProxy<SimpleTreeViewState, HTMLDivElement>;
}

export type SimpleTreeElement = JayElement<SimpleTreeViewState, SimpleTreeElementRefs>;
export type SimpleTreeElementRender = RenderElement<
    SimpleTreeViewState,
    SimpleTreeElementRefs,
    SimpleTreeElement
>;
export type SimpleTreeElementPreRender = [SimpleTreeElementRefs, SimpleTreeElementRender];
export type SimpleTreeContract = JayContract<SimpleTreeViewState, SimpleTreeElementRefs>;

export function render(options?: RenderElementOptions): SimpleTreeElementPreRender {
    const [refManager, [refNodeHeader]] = ReferencesManager.for(options, ['nodeHeader'], [], [], []);

    function renderRecursiveRegion_treeNode(nodeData: SimpleTreeViewState) {
        return de('div', { class: 'tree-node' }, [
            e('div', { class: 'node-header' }, [e('span', {}, [dt((vs: SimpleTreeViewState) => vs.name)])], refNodeHeader()),
            c(
                (vs: SimpleTreeViewState) => vs.open,
                () =>
                    de('ul', {}, [
                        forEach(
                            (vs: SimpleTreeViewState) => vs.children,
                            (childData: SimpleTreeViewState) => {
                                return e('li', {}, [renderRecursiveRegion_treeNode(childData)]);
                            },
                            'id',
                        ),
                    ]),
            ),
        ]);
    }

    const render = (viewState: SimpleTreeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'tree-container' }, [
                e('h1', {}, ['File Browser']),
                renderRecursiveRegion_treeNode(viewState),
            ]),
        ) as SimpleTreeElement;

    return [refManager.getPublicAPI() as SimpleTreeElementRefs, render];
}

