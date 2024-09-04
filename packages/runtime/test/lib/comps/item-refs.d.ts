import { ComponentCollectionProxy, ComponentProxy, EventEmitter } from '../../../lib';
import { Item } from './item';

export type ItemComponentType<ParentVS> = ReturnType<typeof Item<ParentVS>>;

export interface ItemRefs<ParentVS>
    extends ComponentCollectionProxy<ParentVS, ItemComponentType<ParentVS>> {
    onremove: EventEmitter<string, ParentVS>;
}
