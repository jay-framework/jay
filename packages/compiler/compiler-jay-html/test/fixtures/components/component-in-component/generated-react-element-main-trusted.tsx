import { Jay4ReactElementProps, eventsFor } from 'jay-4-react';
import { ReactElement } from 'react';
import { CounterViewState as CounterData } from '../counter/generated-element-main-trusted';
import { Counter } from '../counter/counter';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export interface ComponentInComponentElementRefs {
    // counter1: CounterComponentType<ComponentInComponentViewState>;
    // counterTwo: CounterComponentType<ComponentInComponentViewState>;
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
            <Counter ref="counter1" initialValue={count1} />
            {/* @ts-ignore */}
            <Counter ref="counter-two" initialValue="{count2}" />
            {/* @ts-ignore */}
            <Counter initialValue="{count3}" />
            {/* @ts-ignore */}
            <Counter initialValue="{count4.count}" />
            {/* @ts-ignore */}
            <Counter initialValue="25" />
        </div>
    );
}
