import { JayElement, RenderElement, RenderElementOptions } from 'jay-runtime';
import {
    CounterViewState, CounterRefs, CounterRepeatedRefs
} from '../counter/counter.jay-contract';

export interface NamedContractViewState {
    title: string;
    counter: CounterViewState;
}

export interface NamedContractRefs {
    counter: CounterRefs;
}

export interface NamedContractRepeatedRefs {
    counter: CounterRepeatedRefs;
}

export type NamedContractElement = JayElement<NamedContractViewState, NamedContractRefs>;
export type NamedContractElementRender = RenderElement<
    NamedContractViewState,
    NamedContractRefs,
    NamedContractElement
>;
export type NamedContractElementPreRender = [NamedContractRefs, NamedContractElementRender];

export declare function render(options?: RenderElementOptions): NamedContractElementPreRender;
