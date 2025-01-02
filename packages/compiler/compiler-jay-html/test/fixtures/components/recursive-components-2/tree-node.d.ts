import { JayComponent } from 'jay-runtime';
// @ts-expect-error
import { RecursiveComponents2Element, RecursiveComponents2ViewState } from './generated';

export interface Node {
    id: string;
    name: string;
    firstChild: Node;
    children: Array<Node>;
}
export interface TreeNode
    extends JayComponent<Node, RecursiveComponents2ViewState, RecursiveComponents2Element> {
    update(props: Node);
}

export function treeNode(props: Node): TreeNode;
