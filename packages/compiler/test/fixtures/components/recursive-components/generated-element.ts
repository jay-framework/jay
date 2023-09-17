import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, childComp, compRef as cr, compCollectionRef as ccr, RenderElementOptions} from "jay-runtime";
import {TreeNodeRefs} from "./tree-node-refs";
import {TreeNode, Node} from "./tree-node";

export interface RecursiveComponentsElementRefs {
  counter1: TreeNodeRefs<Node>,
  counterTwo: TreeNodeRefs<Node>
}

export type RecursiveComponentsElement = JayElement<Node, RecursiveComponentsElementRefs>

export function render(viewState: Node, options?: RenderElementOptions): RecursiveComponentsElement {
  return ConstructContext.withRootContext(viewState, () => {
    const refCounter1 = ccr('counter1');
    const refCounterTwo = ccr('counterTwo');
    return e('div', {}, [
      e('div', {}, [dt(vs => vs.name)]),
      childComp(TreeNode, (vs: Node) => vs.firstChild, cr('aR1')),
      de('ul', {}, [
        forEach(vs => vs.children, (vs1: Node) => {
          return e('li', {}, [
            childComp(TreeNode, (vs: Node) => ({name: vs.name, id: vs.id, children: vs.children}), refCounter1())
          ])}, 'id'),
        forEach(vs => vs.children, (vs1: Node) => {
          return e('li', {}, [
            childComp(TreeNode, (vs: Node) => vs, refCounterTwo())
          ])}, 'id')
      ])
    ])}, options);
}
