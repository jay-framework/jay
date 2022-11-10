import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, forEach, ConstructContext, childComp, HTMLElementProxy, RenderElementOptions} from "jay-runtime";
import {TreeNode, Node} from './tree-node';

export interface TreeNodeViewState {
  headChar: string,
  node: Node,
  open: boolean
}

export interface TreeNodeRefs {
  head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeRefs>

export function render(viewState: TreeNodeViewState, options?: RenderElementOptions): TreeNodeElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      e('div', {ref: 'head'}, [
        e('span', {class: 'tree-arrow'}, [dt(vs => vs.headChar)]),
        e('span', {}, [dt(vs => vs.node.name)])
      ]),
      c(vs => vs.open,
        de('ul', {}, [
          forEach(vs => vs.node.children, (vs1: Node) => {
            return e('li', {}, [
              childComp(TreeNode, vs => vs)
            ])}, 'id')
        ])
      )
    ]), options);
}