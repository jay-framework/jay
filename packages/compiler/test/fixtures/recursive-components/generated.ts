import {JayElement, element as e, dynamicText as dt, dynamicElement as de, forEach, ConstructContext, ComponentCollectionProxy, childComp, RenderElementOptions} from "jay-runtime";
import {treeNode, Node} from './tree-node';

export interface RecursiveComponentsRefs {
  counter1: ComponentCollectionProxy<Node, ReturnType<typeof treeNode>>,
  counterTwo: ComponentCollectionProxy<Node, ReturnType<typeof treeNode>>
}

export type RecursiveComponentsElement = JayElement<Node, RecursiveComponentsRefs>

export function render(viewState: Node, options?: RenderElementOptions): RecursiveComponentsElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.name)]),
      childComp(treeNode, vs => vs.firstChild),
      de('ul', {}, [
        forEach(vs => vs.children, (vs1: Node) => {
          return e('li', {}, [
            childComp(treeNode, vs => ({name: vs.name, id: vs.id, children: vs.children}), 'counter1')
          ])}, 'id'),
        forEach(vs => vs.children, (vs1: Node) => {
          return e('li', {}, [
            childComp(treeNode, vs => vs, 'counterTwo')
          ])}, 'id')
      ])
    ]), options, ['counter1', 'counterTwo']);
}
