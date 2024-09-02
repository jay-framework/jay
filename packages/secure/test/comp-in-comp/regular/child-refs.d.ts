import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from 'jay-runtime';
import { Child } from './child';

export type ChildComponentType<ParentVS> = ReturnType<typeof Child<ParentVS>>;

export interface ChildRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, ChildRef<ParentVS>> {
    onChildClick: EventEmitter<EventTypeFrom<ChildComponentType['onChildClick']>, ParentVS>;
}
