import {ComponentCollectionProxy, EventEmitter, JayComponent} from "../../../lib";
import {CounterData, CounterElement, CounterEvent, ViewState} from "./counter-comp";

export interface CounterRef<ParentVS> extends JayComponent<CounterData, ViewState, CounterElement> {
  onChange: EventEmitter<CounterEvent, ParentVS>
}

export interface CounterRefs<ParentVS> extends ComponentCollectionProxy<ViewState, CounterRef<ParentVS>> {
  onChange: EventEmitter<CounterEvent, ParentVS>
}