import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import { CounterComponentType } from '../counter/counter-refs';
import { Counter } from '../counter/counter';
import { CounterViewState as CounterData } from '../counter/generated-element-main-trusted';

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

export type ComponentInComponentElement = JayElement<
    ComponentInComponentViewState,
    ComponentInComponentElementRefs
>;
export type ComponentInComponentElementRender = RenderElement<
    ComponentInComponentViewState,
    ComponentInComponentElementRefs,
    ComponentInComponentElement
>;
export type ComponentInComponentElementPreRender = [
    ComponentInComponentElementRefs,
    ComponentInComponentElementRender,
];

export declare function render(
    options?: RenderElementOptions,
): ComponentInComponentElementPreRender;
