import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from 'jay-runtime';
import { AutoCounter } from './auto-counter';

export type AutoCounterComponentType<ParentVS> = ReturnType<typeof AutoCounter<ParentVS>>;

export interface AutoCounterRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, AutoCounterComponentType<ParentVS>> {}
