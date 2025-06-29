import { TreeElementRefs, render } from './tree.jay-html';
import { makeJayComponent, Props } from '@jay-framework/component';

export interface Node {
    id: string;
    name: string;
    firstChild?: Node;
    children: Array<Node>;
}

let id_counter = 0;
export function node(name: string, children: Node[] = []) {
    return { name, id: '' + id_counter++, children };
}

function TreeNodeConstructor({ name, id, children }: Props<Node>, refs: TreeElementRefs) {
    return {
        render: () => ({ id: 'a', name: 'b', firstChild: undefined, children: [] }),
    };
}
export const TreeNode = makeJayComponent(render, TreeNodeConstructor);
