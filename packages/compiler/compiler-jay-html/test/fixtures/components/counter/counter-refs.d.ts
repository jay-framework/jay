import { ComponentCollectionProxy, MapEventEmitterViewState, OnlyEventEmitters } from 'jay-runtime';
import { Counter } from './counter';

export type CounterComponentType<ParentVS> = MapEventEmitterViewState<
    ParentVS,
    ReturnType<typeof Counter>
>;

export type CounterRefs<ParentVS> = ComponentCollectionProxy<
    ParentVS,
    CounterComponentType<ParentVS>
> &
    OnlyEventEmitters<CounterComponentType<ParentVS>>;
