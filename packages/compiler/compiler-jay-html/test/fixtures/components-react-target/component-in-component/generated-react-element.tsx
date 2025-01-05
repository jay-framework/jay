import { MapEventEmitterViewState } from 'jay-runtime';
import { Jay4ReactElementProps, eventsFor } from 'jay-4-react';
import { ReactElement } from 'react';
import { Counter } from '../counter/counter';
import { CounterViewState as CounterData } from '../counter/generated-react-element';

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

export function render({
    vs,
    context,
}: ComponentInComponentElementProps): ReactElement<ComponentInComponentElementProps, any> {
    return (
        <div>
            {/* @ts-ignore */}
            <Counter initialValue={vs.count1} {...eventsFor(context, 'counter1')} />
            {/* @ts-ignore */}
            <Counter initialValue={vs.count2} {...eventsFor(context, 'counterTwo')} />
            {/* @ts-ignore */}
            <Counter initialValue={vs.count3} />
            {/* @ts-ignore */}
            <Counter initialValue={vs.count4?.count} />
            {/* @ts-ignore */}
            <Counter initialValue={25} />
        </div>
    );
}
