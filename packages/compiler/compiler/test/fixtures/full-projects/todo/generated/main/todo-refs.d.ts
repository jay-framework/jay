import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from 'jay-runtime';
import { TodoComponent } from './todo';

export type TodoComponentComponentType<ParentVS> = ReturnType<typeof TodoComponent<ParentVS>>;

export interface TodoComponentRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, TodoComponentComponentType<ParentVS>> {}
