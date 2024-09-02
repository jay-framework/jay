import {
    JayComponent,
    EventEmitter,
    ComponentCollectionProxy,
    EventTypeFrom,
} from 'jay-runtime';
import { Counter } from './counter';

export type CounterComponentType<ParentVS> = ReturnType<typeof Counter<ParentVS>>;

export interface CounterRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, CounterComponentType<ParentVS>> {}
