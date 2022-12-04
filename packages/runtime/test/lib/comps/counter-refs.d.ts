import {ComponentCollectionProxy, EventEmitter, JayComponent} from "../../../lib";
import {CounterData, CounterElement, ViewState, Counter} from "./counter-comp";

type extractEventType<Type> = Type extends EventEmitter<infer X, any> ? X : null
export type CounterComponentType = ReturnType<typeof Counter>;
export interface CounterRef<ParentVS> extends JayComponent<CounterData, ViewState, CounterElement> {
  onChange: EventEmitter<extractEventType<CounterComponentType['onChange']>, ParentVS>,
  reset: CounterComponentType['reset']
}

export interface CounterRefs<ParentVS> extends ComponentCollectionProxy<ViewState, CounterRef<ParentVS>> {
  onChange: EventEmitter<extractEventType<CounterComponentType['onChange']>, ParentVS>
}