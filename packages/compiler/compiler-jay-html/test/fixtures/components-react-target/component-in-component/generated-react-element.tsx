import { Jay4ReactElementProps, eventsFor } from 'jay-4-react';
import { ReactElement } from 'react';
import { Counter } from '../counter/counter';
import { CounterViewState as CounterData } from '../counter/generated-react-element';
import { CounterComponentType } from '../counter/counter-refs';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export interface ComponentInComponentElementRefs {
    counter1: CounterComponentType<ComponentInComponentViewState>;
    counterTwo: CounterComponentType<ComponentInComponentViewState>;
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
            <Counter {...eventsFor(context, 'counter1')} initialValue={vs.count1} />
            {/* @ts-ignore */}
            <Counter {...eventsFor(context, 'counterTwo')} initialValue={vs.count2} />
            {/* @ts-ignore */}
            <Counter initialValue={vs.count3} />
            {/* @ts-ignore */}
            <Counter initialValue={vs.count4?.count} />
            {/* @ts-ignore */}
            <Counter initialValue="25" />
        </div>
    );
}
