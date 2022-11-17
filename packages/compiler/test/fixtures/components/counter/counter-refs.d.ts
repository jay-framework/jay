import {JayComponent, EventEmitter, ComponentCollectionProxy} from 'jay-runtime';
import {CounterElement, CounterViewState} from "./generated";
import {CounterProps} from "./counter";

export interface CounterRef<ParentVS> extends JayComponent<CounterProps, CounterViewState, CounterElement>{
  onChange: EventEmitter<number, ParentVS>
}

export interface CounterRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> {
  onChange: EventEmitter<number, ParentVS>
}