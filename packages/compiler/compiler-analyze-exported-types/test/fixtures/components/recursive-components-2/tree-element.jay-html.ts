import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from '@jay-framework/runtime';
import { treeNode, Node } from './tree-node';

export interface TreeViewState {
    headChar: string;
    node: Node;
}

export interface TreeElementRefs {}

export type TreeElement = JayElement<TreeViewState, TreeElementRefs>;
export type TreeElementRender = RenderElement<TreeViewState, TreeElementRefs, TreeElement>;
export type TreeElementPreRender = [TreeElementRefs, TreeElementRender];

export function render(options?: RenderElementOptions): TreeElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: TreeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.headChar)]),
                e('div', {}, [dt((vs) => vs.node?.name)]),
                de('ul', {}, [
                    forEach(
                        (vs) => vs.node?.children,
                        (vs1: Node) => {
                            return e('li', {}, [e('TreeNode', { props: da((vs1) => vs1) }, [])]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as TreeElement;
    return [refManager.getPublicAPI() as TreeElementRefs, render];
}
