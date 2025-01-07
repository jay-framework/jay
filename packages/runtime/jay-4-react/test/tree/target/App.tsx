import * as React from 'react';
import { TreeNode, Node } from './tree-node';
import {jay2React, jay2React2} from '../../../lib';

const ReactTreeNode = jay2React2(() => TreeNode);

interface AppProps {
    node: Node
}

export default function App({ node }: AppProps) {
    return (
        <div role={"app"}>
            <ReactTreeNode {...node}/>
        </div>
    );
}
