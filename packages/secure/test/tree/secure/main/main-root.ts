import {ConstructContext, RenderElementOptions} from "jay-runtime";
import {mainRoot as mr} from "../../../../lib/main/main-root";
import {secureChildComp} from "../../../../lib/main/main-child-comp";
import {TreeNode, Node} from "./tree-node";

export function render(viewState: Node, options?: RenderElementOptions) {
    return ConstructContext.withRootContext(viewState, () =>
        mr(viewState, () =>
            secureChildComp(TreeNode, vs => vs, 'comp1')
        ), options);
}