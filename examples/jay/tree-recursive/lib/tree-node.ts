import { render, TreeNodeElementRefs, TreeNodeViewState } from './tree-node.jay-html';
import { createSignal, makeJayComponent, Props } from '@jay-framework/component';
import {patch, REPLACE} from "@jay-framework/json-patch";
import {Coordinate} from "@jay-framework/runtime";

export interface Node {
    id: string;
    name: string;
    children: Array<Node>;
}

export interface TreeNodeProps {
    root: Node;
}

let id_counter = 0;
export function node(name: string, children: Node[] = []): Node {
    return { name, id: '' + id_counter++, children };
}

function nodeToTreeNodeViewState({id, name, children}: Node): TreeNodeViewState {
    return {
        id,
        name,
        open: false,
        hasChildren: children.length > 0,
        children: children.map(nodeToTreeNodeViewState)
    }
}

/**
 * transforms a coordinate into a json patch path, using attributes names and indexes
 * @param node - the root node of the tree
 * @param coordinate - which can look like `['13', '12', '11', 'head']`
 * @returns json patch path, such as `['children', 2, 'children', 0, 'children', 1]`
 */
function findPathToNodeInTree(node: TreeNodeViewState, coordinate: Coordinate): (string | number)[] {
    if (coordinate.length > 1) {
        const id = coordinate[0];
        const index = node.children.findIndex(_ => _.id === id);
        const restOfPath = findPathToNodeInTree(node.children[index], coordinate.slice(1))
        return ['children', index, ...restOfPath]
    }
    return [];
}

function TreeNodeConstructor({root}: Props<TreeNodeProps>, refs: TreeNodeElementRefs) {
    const [rootNode, setRootNode] = createSignal(nodeToTreeNodeViewState(root()));

    refs.head.onclick(({viewState, coordinate}) => {
        const replaceNodePath = findPathToNodeInTree(rootNode(), coordinate);
        console.log(coordinate, replaceNodePath)
        setRootNode(
            patch(rootNode(), [
                {
                    op: REPLACE,
                    path: [...replaceNodePath, 'open'],
                    value: !viewState.open
                }
            ]));
    });

    return {
        render: rootNode,
    };
}

export const TreeNode = makeJayComponent(render, TreeNodeConstructor);

