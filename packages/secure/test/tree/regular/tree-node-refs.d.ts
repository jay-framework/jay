import {
    ComponentCollectionProxy,
} from 'jay-runtime';
import { TreeNode } from './tree-node';

export type TreeNodeComponentType<ParentVS> = ReturnType<typeof TreeNode<ParentVS>>;

export interface TreeNodeRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, TreeNodeComponentType<ParentVS>> {}
