import { Node, TreeNode } from './tree-node';
import { sandboxRoot } from '../../../../lib/';
import { sandboxChildComp } from '../../../../lib/';
import { compRef } from '../../../../lib';

export function initializeWorker() {
    sandboxRoot(() => [sandboxChildComp(TreeNode, (vs) => vs, compRef('comp1'))]);
}
