import {ComponentCollectionProxy, EventEmitter, JayComponent} from "../../../lib";
import {ItemElement, ItemProps, ItemVS} from "./item";

export interface ItemComponent<ParentVS> extends JayComponent<ItemProps, ItemVS, ItemElement> {
  onremove: EventEmitter<string, ParentVS>

  getItemSummary(): string
}

export interface ItemComponentCollection<ParentVS> extends ComponentCollectionProxy<ParentVS, ItemComponent<ParentVS>> {
  onremove: EventEmitter<string, ParentVS>
}