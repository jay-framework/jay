export interface Node {
  id: string,
  name: string,
  children: Array<Node>
}

export function treeNode(props: Node)
export interface TreeNode {
  update(props: Node)
}
