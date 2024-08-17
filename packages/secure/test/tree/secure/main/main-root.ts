import { ConstructContext, RenderElementOptions, compRef as cr } from 'jay-runtime';
import { mainRoot as mr } from '../../../../lib/';
import { secureChildComp } from '../../../../lib/';
import { TreeNode, Node } from './tree-node';

export function render(viewState: Node, options?: RenderElementOptions) {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const comp1 = cr('comp1');
            return mr(viewState, () => secureChildComp(TreeNode, (vs) => vs, comp1()))
        }, options
    );
}
