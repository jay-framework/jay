import {JayElement, element as e, dynamicText as dt, dynamicElement as de, ConstructContext, childComp} from "jay-runtime";
import {treeNode, Node} from './tree-node';

export interface RecursiveComponentsRefs {
  counter1: ReturnType<typeof treeNode>,
  counterTwo: ReturnType<typeof treeNode>
}

export type RecursiveComponentsElement = JayElement<Node, RecursiveComponentsRefs>

export function render(viewState: Node): RecursiveComponentsElement {
  return ConstructContext.withRootContext(viewState, () =>
    e('div', {}, [
      e('div', {}, [dt(vs => vs.name)]),
      de('li', {}, [
        childComp(treeNode, vs => ({name: vs.name, id: vs.id, children: vs.children})),
      ]),
      de('li', {}, [
        childComp(treeNode, vs => (vs)),
      ])
    ]));
}

