import { render } from './tree-node.jay-html';
import { makeJayComponentBridge } from '../../../../lib/main/main-bridge';

export interface Node {
    id: string;
    name: string;
    children: Array<Node>;
}

export const TreeNode = makeJayComponentBridge(render);
