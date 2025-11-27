import {
    JayElement,
    RenderElement,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
} from '@jay-framework/runtime';
import { Counter } from '../counter/counter';
import { CounterViewState as CounterData } from '../counter/generated-element-main-trusted';

export interface ComponentInComponentViewState {
    count1: number;
    count2: number;
    count3: number;
    count4: CounterData;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface ComponentInComponentElementRefs {
    counter1: CounterRef<ComponentInComponentViewState>;
    counterTwo: CounterRef<ComponentInComponentViewState>;
}

export type ComponentInComponentSlowViewState = {};
export type ComponentInComponentFastViewState = {};
export type ComponentInComponentInteractiveViewState = ComponentInComponentViewState;

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
export type ComponentInComponentContract = JayContract<
    ComponentInComponentViewState,
    ComponentInComponentElementRefs,
    ComponentInComponentSlowViewState,
    ComponentInComponentFastViewState,
    ComponentInComponentInteractiveViewState
>;

export declare function render(
    options?: RenderElementOptions,
): ComponentInComponentElementPreRender;
