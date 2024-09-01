import {JayElement, RenderElement, RenderElementOptions} from 'jay-runtime';

export interface O1 {
    s2: string;
    n2: number;
}

export interface A1 {
    s3: string;
    n3: number;
}

export interface DataTypesViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1;
    a1: Array<A1>;
}

export interface DataTypesElementRefs {}

export type DataTypesElement = JayElement<DataTypesViewState, DataTypesElementRefs>;
export type DataTypesElementRender = RenderElement<
    DataTypesViewState,
    DataTypesElementRefs,
    DataTypesElement
>;
export type DataTypesElementPreRender = [refs: DataTypesElementRefs, DataTypesElementRender];

export declare function render(options?: RenderElementOptions): DataTypesElementPreRender;
