import { HTMLElementProxy, JayElement, RenderElement } from '@jay-framework/runtime';
import { Node, TreeNode } from './tree-node';
import { elementBridge, SecureReferencesManager } from '../../../../lib';
import {
    sandboxElement as e,
    sandboxForEach as forEach,
    sandboxChildComp as childComp,
} from '../../../../lib/';

export interface TreeNodeViewState {
    headChar: string;
    node: Node;
    open: boolean;
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>;
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>;
export type TreeNodeElementRender = RenderElement<
    TreeNodeViewState,
    TreeNodeElementRefs,
    TreeNodeElement
>;
export type TreeNodeElementPreRender = [refs: TreeNodeElementRefs, TreeNodeElementRender];

export function render(): TreeNodeElementPreRender {
    const [refManager, [head, child]] = SecureReferencesManager.forElement(
        ['head'],
        [],
        [],
        ['child'],
    );
    const render = (viewState: TreeNodeViewState) =>
        elementBridge(
            viewState,
            refManager,
            () => {
                return [
                    e(head()),
                    forEach(
                        (viewState: TreeNodeViewState) => viewState.node?.children,
                        'id',
                        () => [childComp(TreeNode, (vs) => vs, child())],
                    ),
                ];
            },
            [[['node', 'children'], { matchBy: 'id' }]],
        ) as unknown as TreeNodeElement;
    return [refManager.getPublicAPI() as TreeNodeElementRefs, render];
}
