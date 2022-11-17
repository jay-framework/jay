import {JayComponent, EventEmitter, ComponentCollectionProxy} from 'jay-runtime';
import {CounterElement, CounterViewState} from "./generated";
import {CounterProps} from "./counter";

export interface CounterComponent<ParentVS> extends JayComponent<CounterProps, CounterViewState, CounterElement>{
  onChange: EventEmitter<number, ParentVS>
}

export interface CounterComponentCollection<ParentVS> extends ComponentCollectionProxy<ParentVS, CounterComponent<ParentVS>> {
  onChange: EventEmitter<number, ParentVS>
}