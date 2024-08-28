import {
    ComponentCollectionProxy,
} from 'jay-runtime';
import { Counter } from './counter';

export type CounterComponentType<ParentVS> = ReturnType<typeof Counter<ParentVS>>;

export interface CounterRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> {}
