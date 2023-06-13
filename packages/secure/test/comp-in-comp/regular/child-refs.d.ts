import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {Child} from "./child";

export type ChildComponentType = ReturnType<typeof Child>;

export interface ChildRef<ParentVS> extends JayComponent<
  PropsFrom<ChildComponentType>,
  ViewStateFrom<ChildComponentType>,
  ElementFrom<ChildComponentType>>{
  onChildClick: EventEmitter<EventTypeFrom<ChildComponentType['onChildClick']>, ParentVS>
  setChildText: ChildComponentType['setChildText']
}

export interface ChildRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, ChildRef<ParentVS>> {
  onChildClick: EventEmitter<EventTypeFrom<ChildComponentType['onChildClick']>, ParentVS>
}