import * as React from 'react';
import { TreeNode, Node } from './tree-node';
import { jay2React } from '../../../lib';

const ReactTreeNode = jay2React(() => TreeNode);

interface AppProps {
    root: string,
    children: Node[]
}

export default function App({ root, children }: AppProps) {
    return (
        <div>
            <ReactTreeNode id={'a'} name={root} children={children}/>
        </div>
    );
}
