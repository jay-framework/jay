import { ComponentCollectionProxy, EventEmitter, JayComponent } from '../../../lib';
import { ItemElement, ItemProps, ItemVS } from './item';

export interface ItemRef<ParentVS> extends JayComponent<ItemProps, ItemVS, ItemElement> {
    onremove: EventEmitter<string, ParentVS>;

    getItemSummary(): string;
}

export interface ItemRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, ItemRef<ParentVS>> {
    onremove: EventEmitter<string, ParentVS>;
}
