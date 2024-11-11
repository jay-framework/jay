import { EventEmitter, ComponentCollectionProxy, EventTypeFrom } from 'jay-runtime';
import { Item } from './item';

export type ItemComponentType<ParentVS> = ReturnType<typeof Item<ParentVS>>;

export interface ItemRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, ItemComponentType<ParentVS>> {
    onCompletedToggle: EventEmitter<
        EventTypeFrom<ItemComponentType<ParentVS>['onCompletedToggle']>,
        ParentVS
    >;
    onRemove: EventEmitter<EventTypeFrom<ItemComponentType<ParentVS>['onRemove']>, ParentVS>;
    onTitleChanged: EventEmitter<
        EventTypeFrom<ItemComponentType<ParentVS>['onTitleChanged']>,
        ParentVS
    >;
}
