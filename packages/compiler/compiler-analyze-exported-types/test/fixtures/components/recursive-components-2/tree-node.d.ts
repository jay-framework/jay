import { JayComponent } from '@jay-framework/runtime';
import { TreeElement, TreeViewState } from './tree-element.jay-html';

export interface Node {
    id: string;
    name: string;
    firstChild: Node;
    children: Array<Node>;
}
export interface TreeNode extends JayComponent<Node, TreeViewState, TreeElement> {
    update(props: Node);
}

export function treeNode(props: Node): TreeNode;
