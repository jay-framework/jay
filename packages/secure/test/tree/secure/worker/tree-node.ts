import {render, TreeNodeElementRefs} from './tree-node.jay.html';
import {createState, createMemo, makeJayComponent, Props} from 'jay-component';

export interface Node {
    id: string,
    name: string,
    children: Array<Node>
}

let id_counter = 0;
export function node(name: string, children: Node[] = []) {
    return {name, id: '' + id_counter++, children}
}

function TreeNodeConstructor({name, id, children}: Props<Node>, refs: TreeNodeElementRefs) {
    // console.log('create sandbox component', id())
    let [open, setOpen] = createState(false);
    let headChar = createMemo(() => children()?.length > 0 ? (open()?"▼":"►"):"")
    let node = createMemo(() => ({name: name(), id: id(), children: children()}));

    refs.head.onclick(() => setOpen(!open()))

    return {
        render: () => ({headChar, node, open})
    }
}

export const TreeNode = makeJayComponent(render, TreeNodeConstructor);