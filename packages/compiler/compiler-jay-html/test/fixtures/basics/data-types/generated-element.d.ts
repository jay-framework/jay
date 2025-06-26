import { JayElement, RenderElement, RenderElementOptions, JayContract } from 'jay-runtime';

export interface O1OfDataTypesViewState {
    s2: string;
    n2: number;
}

export interface A1OfDataTypesViewState {
    s3: string;
    n3: number;
}

export interface DataTypesViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1OfDataTypesViewState;
    a1: Array<A1OfDataTypesViewState>;
}

export interface DataTypesElementRefs {}

export type DataTypesElement = JayElement<DataTypesViewState, DataTypesElementRefs>;
export type DataTypesElementRender = RenderElement<
    DataTypesViewState,
    DataTypesElementRefs,
    DataTypesElement
>;
export type DataTypesElementPreRender = [DataTypesElementRefs, DataTypesElementRender];
export type DataTypesContract = JayContract<DataTypesViewState, DataTypesElementRefs>;

export declare function render(options?: RenderElementOptions): DataTypesElementPreRender;
