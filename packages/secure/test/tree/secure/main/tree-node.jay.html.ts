import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    conditional as c,
    dynamicElement as de,
    forEach,
    elemRef as er, compCollectionRef as ccr,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    useContext, provideContext
} from "jay-runtime";
import {secureChildComp as childComp} from "../../../../lib/";
import {TreeNodeRefs} from './tree-node-refs';
import {TreeNode, Node} from './tree-node';
import {SECURE_COMPONENT_MARKER} from "../../../../lib/main/main-contexts";

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
    let context = useContext(SECURE_COMPONENT_MARKER);
    return ConstructContext.withRootContext(viewState, () => {
        const refChild = ccr('child');
        return de('div', {}, [
            e('div', {ref: 'head', "data-ref": da(vs => `head=${vs.node?.id}`)}, [
                e('span', {class: 'tree-arrow'}, [dt(vs => vs.headChar)]),
                e('span', {class: 'name'}, [dt(vs => vs.node?.name)])
            ], er('head')),
            c(vs => vs.open,
                de('ul', {"data-ref": da(vs => `list=${vs.node?.id}`)}, [
                    forEach(vs => vs.node?.children, (vs1: Node) => {
                        return provideContext(SECURE_COMPONENT_MARKER, context, () => {
                            return e('li', {}, [
                                childComp(TreeNode, vs => vs, refChild())
                            ])
                        })
                    }, 'id')
                ])
            )
        ])}, options);
}