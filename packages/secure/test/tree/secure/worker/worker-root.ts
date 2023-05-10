import {Node, TreeNode} from "./tree-node";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";
import {sandboxChildComp} from "../../../../lib/sandbox/sandbox-element";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, Node>(TreeNode, vs => vs, 'comp1')
    ])
}