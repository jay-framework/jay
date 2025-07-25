import { render, render2, TreeNodeElementRefs } from './tree-node.jay-html';
import { createSignal, createMemo, makeJayComponent, Props } from '@jay-framework/component';

export interface Node {
    id: string;
    name: string;
    children: Array<Node>;
}

let id_counter = 0;
export function node(name: string, children: Node[] = []) {
    return { name, id: '' + id_counter++, children };
}

function TreeNodeConstructor({ name, id, children }: Props<Node>, refs: TreeNodeElementRefs) {
    let [open, setOpen] = createSignal(true);
    let headChar = createMemo(() => (children().length > 0 ? (open() ? '▼' : '►') : ''));
    let node = createMemo(() => ({ name: name(), id: id(), children: children() }));

    refs.head.onclick(() => {
        setOpen(!open());
    });

    return {
        render: () => ({ headChar, node, open }),
    };
}

export const TreeNode = makeJayComponent(render2, TreeNodeConstructor);
