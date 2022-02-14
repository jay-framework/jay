import {render, TreeNodeRefs} from './tree-node.jay.html';
import {createState, makeJayComponent, Props} from 'jay-component';

export interface Node {
    id: string,
    name: string,
    children: Array<Node>
}

let id_counter = 0;
export function node(name: string, children: Node[] = []) {
    return {name, id: '' + id_counter++, children}
}

function TreeNodeConstructor(props: Props<Node>, refs: TreeNodeRefs) {

    return {
        render: () => (props)
    }
}

export const TreeNode = makeJayComponent(render, TreeNodeConstructor);