import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from 'jay-runtime';
import { AutoCounterTsJayMainSandbox } from './auto-counter.ts?jay-mainSandbox';

export type AutoCounterComponentType<ParentVS> = ReturnType<
    typeof AutoCounterTsJayMainSandbox<ParentVS>
>;

export interface AutoCounterRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, AutoCounterComponentType<ParentVS>> {}
