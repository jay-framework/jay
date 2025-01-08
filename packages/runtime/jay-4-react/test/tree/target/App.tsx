import * as React from 'react';
import { TreeNode, Node } from './tree-node';
import { jay2React } from '../../../lib';

const ReactTreeNode = jay2React(() => TreeNode);

interface AppProps {
    node: Node;
}

export default function App({ node }: AppProps) {
    return (
        <div role={'app'}>
            <ReactTreeNode {...node} />
        </div>
    );
}
