import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, childComp, RenderElementOptions} from "jay-runtime";
import {TreeNodeRefs} from './tree-node-refs';
import {TreeNode, Node} from './tree-node';

export interface RecursiveComponentsRefs {
  counter1: TreeNodeRefs<Node>,
  counterTwo: TreeNodeRefs<Node>
}

export type RecursiveComponentsElement = JayElement<Node, RecursiveComponentsRefs>

export function render(viewState: Node, options?: RenderElementOptions): RecursiveComponentsElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.name)]),
      childComp(TreeNode, vs => vs.firstChild),
      de('ul', {}, [
        forEach(vs => vs.children, (vs1: Node) => {
          return e('li', {}, [
            childComp(TreeNode, vs => ({name: vs.name, id: vs.id, children: vs.children}), 'counter1')
          ])}, 'id'),
        forEach(vs => vs.children, (vs1: Node) => {
          return e('li', {}, [
            childComp(TreeNode, vs => vs, 'counterTwo')
          ])}, 'id')
      ])
    ]), options, ['counter1', 'counterTwo']);
}
