import { ComponentCollectionProxy, EventEmitter, JayComponent } from '../../../lib';
import { ViewState, Counter } from './counter-comp';

type extractEventType<Type> = Type extends EventEmitter<infer X, any> ? X : null;
export type CounterComponentType = ReturnType<typeof Counter>;

export interface CounterRefs<ParentVS>
    extends ComponentCollectionProxy<ViewState, CounterComponentType> {
    onChange: EventEmitter<extractEventType<CounterComponentType['onChange']>, ParentVS>;
}
