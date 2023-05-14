import {JayComponent, EventEmitter, ComponentCollectionProxy, EventTypeFrom, PropsFrom, ViewStateFrom, ElementFrom} from 'jay-runtime';
import {Counter} from "../worker/counter";
import {AsyncFunction} from "../../../../lib/flat-async-function";

export type CounterComponentType = ReturnType<typeof Counter>;

export interface CounterRef<ParentVS> extends JayComponent<
  PropsFrom<CounterComponentType>,
  ViewStateFrom<CounterComponentType>,
  ElementFrom<CounterComponentType>>{
  onChange: EventEmitter<EventTypeFrom<CounterComponentType['onChange']>, ParentVS>
  counterDescription: AsyncFunction<CounterComponentType['counterDescription']>
}

export interface CounterRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> {
  onChange: EventEmitter<EventTypeFrom<CounterComponentType['onChange']>, ParentVS>
}