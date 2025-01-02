import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from 'jay-runtime';
import { Counter } from './counter';
import { ReactToCompRef } from 'jay-4-react';

export type CounterComponentType<ParentVS> = ReactToCompRef<typeof Counter>;

export interface CounterRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, CounterComponentType<ParentVS>> {
    onChange: EventEmitter<EventTypeFrom<CounterComponentType<ParentVS>['onChange']>, ParentVS>;
}
