import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {Parent} from "./parent";

export type ParentComponentType = ReturnType<typeof Parent>;

export interface ParentRef<ParentVS> extends JayComponent<
  PropsFrom<ParentComponentType>,
  ViewStateFrom<ParentComponentType>,
  ElementFrom<ParentComponentType>>{
  
}

export interface ParentRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, ParentRef<ParentVS>> {
  
}