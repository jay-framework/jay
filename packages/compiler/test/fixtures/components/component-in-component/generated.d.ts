import {JayElement, RenderElementOptions} from "jay-runtime";
import {CounterRef} from '../counter/counter-refs';
import {Counter} from '../counter/counter';
import {CounterViewState as CounterData} from '../counter/generated';

export interface ComponentInComponentViewState {
  count1: number,
  count2: number,
  count3: number,
  count4: CounterData
}

export interface ComponentInComponentElementRefs {
  counter1: CounterRef<ComponentInComponentViewState>,
  counterTwo: CounterRef<ComponentInComponentViewState>
}

export type ComponentInComponentElement = JayElement<ComponentInComponentViewState, ComponentInComponentElementRefs>

export declare function render(viewState: ComponentInComponentViewState, options?: RenderElementOptions): ComponentInComponentElement