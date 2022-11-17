import {JayComponent, EventEmitter, ComponentCollectionProxy} from 'jay-runtime';
import {TreeNodeElement, TreeNodeViewState} from "./generated";
import {Node} from "./tree-node";

export interface TreeComponent<ParentVS> extends JayComponent<Node, TreeNodeViewState, TreeNodeElement>{
  onChange: EventEmitter<number, ParentVS>
}

export interface TreeComponentCollection<ParentVS> extends ComponentCollectionProxy<ParentVS, TreeComponent<ParentVS>> {
  onChange: EventEmitter<number, ParentVS>
}