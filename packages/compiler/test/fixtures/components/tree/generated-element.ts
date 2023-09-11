import {JayElement, element as e, dynamicText as dt, conditional as c, dynamicElement as de, forEach, ConstructContext, HTMLElementProxy, childComp, elemRef as er, RenderElementOptions} from "jay-runtime";
import {TreeNode, Node} from './tree-node';

export interface TreeNodeViewState {
  headChar: string,
  node: Node,
  open: boolean
}

export interface TreeNodeElementRefs {
  head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>

export function render(viewState: TreeNodeViewState, options?: RenderElementOptions): TreeNodeElement {
  return ConstructContext.withRootContext(viewState, () =>
    de('div', {}, [
      e('div', {}, [
        e('span', {class: 'tree-arrow'}, [dt(vs => vs.headChar)]),
        e('span', {}, [dt(vs => vs.node?.name)])
      ], er('head')),
      c(vs => vs.open,
        de('ul', {}, [
          forEach(vs => vs.node?.children, (vs1: Node) => {
            return e('li', {}, [
              childComp(TreeNode, (vs: Node) => vs)
            ])}, 'id')
        ])
      )
    ]), options);
}