import { ComponentCollectionProxy, EventEmitter, JayComponent } from '../../../lib';
import { ViewState, Counter } from './counter-comp';
import {MapEventEmitterViewState, OnlyEventEmitters} from "../../../dist";

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export type CounterRefs<ParentVS> = ComponentCollectionProxy<ParentVS, CounterRef<ParentVS>> &
    OnlyEventEmitters<CounterRef<ParentVS>>;