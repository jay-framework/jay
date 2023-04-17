import {JayElement, element as e, dynamicText as dt, dynamicAttribute as da, conditional as c, dynamicElement as de, forEach, ConstructContext, HTMLElementProxy, childComp, RenderElementOptions} from "jay-runtime";
import {TreeNodeRefs} from './tree-node-refs';
import {TreeNode, Node} from './tree-node';

export interface TreeNodeViewState {
    headChar: string,
    node: Node,
    open: boolean
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>,
    child: TreeNodeRefs<Node>
}

export type TreeNodeElement = JayElement<TreeNodeViewState, TreeNodeElementRefs>

export function render(viewState: TreeNodeViewState, options?: RenderElementOptions): TreeNodeElement {
    return ConstructContext.withRootContext(viewState, () =>
        de('div', {}, [
            e('div', {ref: 'head', "data-ref": da(vs => `head=${vs.node?.id}`)}, [
                e('span', {class: 'tree-arrow'}, [dt(vs => vs.headChar)]),
                e('span', {}, [dt(vs => vs.node?.name)])
            ]),
            c(vs => vs.open,
                de('ul', {"data-ref": da(vs => `list=${vs.node?.id}`)}, [
                    forEach(vs => vs.node?.children, (vs1: Node) => {
                        return e('li', {}, [
                            childComp(TreeNode, vs => vs, 'child')
                        ])}, 'id')
                ])
            )
        ]), options, ['child']);
}