import { ComponentCollectionProxy, ComponentProxy, EventEmitter } from '../../../lib';
import { Item } from './item';
import {MapEventEmitterViewState, OnlyEventEmitters} from "../../../dist";

export type ItemRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Item>>;
export type ItemRefs<ParentVS> = ComponentCollectionProxy<ParentVS, ItemRef<ParentVS>> &
    OnlyEventEmitters<ItemRef<ParentVS>>;