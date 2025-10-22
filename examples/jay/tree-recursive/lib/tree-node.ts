import { render, TreeNodeElementRefs, TreeNodeViewState } from './tree-node.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';

export interface Node {
    id: string;
    name: string;
    children: Array<Node>;
}

let id_counter = 0;
export function node(name: string, children: Node[] = []): Node {
    return { name, id: '' + id_counter++, children };
}

function TreeNodeConstructor({ name, id, children }: Props<Node>, refs: TreeNodeElementRefs) {
    let [open, setOpen] = createSignal(children().length > 0);

    refs.head.onclick(() => {
        if (children().length > 0) {
            setOpen(!open());
        }
    });

    return {
        render: (): TreeNodeViewState => ({
            name: name(),
            id: id(),
            open: open(),
            hasChildren: children().length > 0,
            children: children(),
        }),
    };
}

export const TreeNode = makeJayComponent(render, TreeNodeConstructor);

