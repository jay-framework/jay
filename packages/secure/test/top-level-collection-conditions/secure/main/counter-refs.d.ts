import {
    EventEmitter,
    ComponentCollectionProxy,
    EventTypeFrom,
} from 'jay-runtime';
import { Counter } from '../worker/counter';

export type CounterComponentType<ParentVS> = ReturnType<typeof Counter<ParentVS>>;

export interface CounterRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, CounterComponentType<ParentVS>> {
    onChange: EventEmitter<EventTypeFrom<CounterComponentType['onChange']>, ParentVS>;
}
