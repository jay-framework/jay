import {RecursiveComponentsRefs, render} from "./generated";
import {makeJayComponent, Props} from 'jay-component';

export interface Node {
  id: string,
  name: string,
  firstChild?: Node,
  children: Array<Node>
}
function TreeNodeConstructor({name, id, children}: Props<Node>, refs: RecursiveComponentsRefs) {
  return {
    render: () => ({id: 'a', name: 'b', firstChild: undefined, children: []})
  }
}
export const TreeNode = makeJayComponent(render, TreeNodeConstructor);
