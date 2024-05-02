import { CounterElement, CounterElementProps, CounterElementViewState } from './counter-element';
import { ComponentBridge } from '../../../lib/main-bridge';

export interface CounterProps {
    initialCount: number;
}

export const CounterBridge = ComponentBridge<
    CounterElementViewState,
    CounterProps,
    CounterElementProps
>(CounterElement);
