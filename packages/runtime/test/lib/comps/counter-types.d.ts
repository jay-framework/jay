import {ComponentCollectionProxy, EventEmitter, JayComponent} from "../../../lib";
import {CounterData, CounterElement, CounterEvent, ViewState} from "./counter-comp";

export interface CounterComponent<ParentVS> extends JayComponent<CounterData, ViewState, CounterElement> {
  onChange: EventEmitter<CounterEvent, ParentVS>
}

export interface ItemComponentCollection<ParentVS> extends ComponentCollectionProxy<ViewState, CounterComponent<ParentVS>> {
  onChange: EventEmitter<CounterEvent, ParentVS>
}