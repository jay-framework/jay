import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {Counter} from "./counter";

export type CounterComponentType = ReturnType<typeof Counter>;

export interface CounterRef<ParentVS> extends JayComponent<
  PropsFrom<CounterComponentType>,
  ViewStateFrom<CounterComponentType>,
  ElementFrom<CounterComponentType>>{
  onChange: EventEmitter<EventTypeFrom<CounterComponentType['onChange']>, ParentVS>
  reset: CounterComponentType['reset']
}

export interface CounterRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> {
  onChange: EventEmitter<EventTypeFrom<CounterComponentType['onChange']>, ParentVS>
}