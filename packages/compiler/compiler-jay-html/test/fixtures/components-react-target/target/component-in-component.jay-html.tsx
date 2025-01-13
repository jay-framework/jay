import { MapEventEmitterViewState } from 'jay-runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, jay2React, mimicJayElement } from 'jay-4-react';
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

const ReactCounter = jay2React(() => Counter);

export function reactRender({
    vs,
    context,
}: ComponentInComponentElementProps): ReactElement<ComponentInComponentElementProps, any> {
    return (
        <div>
            <ReactCounter initialValue={vs.count1} title={'counter 1'} {...eventsFor(context, 'counter1')} />
            <ReactCounter initialValue={vs.count2} {...eventsFor(context, 'counterTwo')} />
            <ReactCounter initialValue={vs.count3} />
            <ReactCounter initialValue={vs.count4?.count} />
            <ReactCounter initialValue={25} />
        </div>
    );
}

export const render = mimicJayElement(reactRender);
