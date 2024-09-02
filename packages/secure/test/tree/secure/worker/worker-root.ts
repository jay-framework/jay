import { Node, TreeNode } from './tree-node';
import { sandboxRoot, SecureReferencesManager } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [comp1]] = SecureReferencesManager.forSandboxRoot([], [], ['comp1'], []);
        return [sandboxChildComp(TreeNode, (vs) => vs, comp1())];
    });
}
