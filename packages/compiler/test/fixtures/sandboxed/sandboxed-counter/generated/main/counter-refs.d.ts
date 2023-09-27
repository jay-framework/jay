import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {Counter} from "./counter";

export type CounterComponentType = ReturnType<typeof Counter>;

export interface CounterRef<ParentVS> extends JayComponent<
  PropsFrom<CounterComponentType>,
  ViewStateFrom<CounterComponentType>,
  ElementFrom<CounterComponentType>>{}

export interface CounterRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> {}