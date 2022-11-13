import {JayComponent} from 'jay-runtime'
import {RecursiveComponentsElement} from "./generated";

export interface Node {
  id: string,
  name: string,
  firstChild: Node,
  children: Array<Node>
}
export interface TreeNode extends JayComponent<Node, Node, RecursiveComponentsElement> {
  update(props: Node)
}

export function treeNode(props: Node): TreeNode
