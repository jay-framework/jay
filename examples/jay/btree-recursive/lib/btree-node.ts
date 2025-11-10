import {render, BtreeNodeElementRefs, BtreeNodeViewState, TreeOfBtreeNodeViewState} from './btree-node.jay-html';
import { makeJayComponent, Props } from '@jay-framework/component';

export interface BTreeNode {
    value: number;
    id: string;
    left: BTreeNode | null;
    right: BTreeNode | null;
}

let id_counter = 0;
export function btreeNode(
    value: number,
    left: BTreeNode | null = null,
    right: BTreeNode | null = null,
): BTreeNode {
    return { value, id: '' + id_counter++, left, right };
}

function BtreeNodeConstructor(rootNode: Props<BTreeNode>, refs: BtreeNodeElementRefs) {
    const mapNodeToViewState = ({ value, id, left, right }: BTreeNode): TreeOfBtreeNodeViewState => {
        return {
            value,
            id,
            left: left ? mapNodeToViewState(left) : null,
            right: right ? mapNodeToViewState(right) : null,
            hasLeft: left !== null,
            hasRight: right !== null,
        };
    };
    return {
        render: (): BtreeNodeViewState => ({
            tree: mapNodeToViewState(rootNode.props())
        }),
    };
}

export const BtreeNode = makeJayComponent(render, BtreeNodeConstructor);

