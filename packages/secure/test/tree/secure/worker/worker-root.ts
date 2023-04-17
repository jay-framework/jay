import {TreeNode} from "./tree-node";
import {sandboxRoot} from "../../../../lib/sandbox/sandbox-root";

export function initializeWorker() {
    sandboxRoot([{
        refName: 'comp1',
        compCreator: TreeNode,
        getProps: vs => vs}])
}