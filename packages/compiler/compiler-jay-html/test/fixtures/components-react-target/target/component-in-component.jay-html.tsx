import { MapEventEmitterViewState } from 'jay-runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, jay2React } from 'jay-4-react';
import { Counter } from './counter';
import { CounterViewState as CounterData } from './counter.jay-html';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, any>;
export interface ComponentInComponentElementRefs {
    counter1: CounterRef<ComponentInComponentViewState>;
    counterTwo: CounterRef<ComponentInComponentViewState>;
}

export interface ComponentInComponentElementProps
    extends Jay4ReactElementProps<ComponentInComponentViewState> {}

const ReactCounter = jay2React(Counter);

export function render({
    vs,
    context,
}: ComponentInComponentElementProps): ReactElement<ComponentInComponentElementProps, any> {
    return (
        <div>
            {/* @ts-ignore */}
            <ReactCounter initialValue={vs.count1} {...eventsFor(context, 'counter1')} />
            {/* @ts-ignore */}
            <ReactCounter initialValue={vs.count2} {...eventsFor(context, 'counterTwo')} />
            {/* @ts-ignore */}
            <ReactCounter initialValue={vs.count3} />
            {/* @ts-ignore */}
            <ReactCounter initialValue={vs.count4?.count} />
            {/* @ts-ignore */}
            <ReactCounter initialValue={25} />
        </div>
    );
}
