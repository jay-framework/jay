import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {TreeNode} from "./tree-node";

export type TreeNodeComponentType = ReturnType<typeof TreeNode>;

export interface TreeNodeRef<ParentVS> extends JayComponent<
  PropsFrom<TreeNodeComponentType>,
  ViewStateFrom<TreeNodeComponentType>,
  ElementFrom<TreeNodeComponentType>>{
  
}

export interface TreeNodeRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, TreeNodeRef<ParentVS>> {
  
}