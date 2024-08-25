import {ComponentCollectionProxy, ComponentProxy, EventEmitter} from '../../../lib';
import {Item} from "./item.ts";

export type ItemComponentType<ParentVS> = ReturnType<typeof Item<ParentVS>>;
export interface ItemRef<ParentVS> extends ComponentProxy<ParentVS, ItemComponentType<ParentVS>> {
    onremove: EventEmitter<string, ParentVS>;
    comp: ItemComponentType<ParentVS> | undefined
}

export interface ItemRefs<ParentVS> extends ComponentCollectionProxy<ParentVS, ItemComponentType<ParentVS>> {
    onremove: EventEmitter<string, ParentVS>;
}
