import { JayContract } from '@jay-framework/runtime';

export interface O1OfDataTypesViewState {
    s2: string;
    n2: number;
}

export interface A1OfDataTypesViewState {
    id: string;
    s3: string;
    n3: number;
}

export interface Po1OfDataTypesViewState {
    ps2: string;
    pn2: number;
}

export interface Pa1OfDataTypesViewState {
    id: string;
    ps3: string;
    pn3: number;
}

export interface DataTypesViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1OfDataTypesViewState;
    a1: Array<A1OfDataTypesViewState>;
    p1: Promise<string>;
    po1: Promise<Po1OfDataTypesViewState>;
    pa1: Promise<Array<Pa1OfDataTypesViewState>>;
}

export type DataTypesSlowViewState = Pick<DataTypesViewState, 's1' | 'n1' | 'b1' | 'p1'> & {
    o1: DataTypesViewState['o1'];
    a1: Array<DataTypesViewState['a1'][number]>;
    po1: Promise<DataTypesViewState['po1']>;
    pa1: Promise<Array<DataTypesViewState['pa1'][number]>>;
};

export type DataTypesFastViewState = {};

export type DataTypesInteractiveViewState = {};

export interface DataTypesRefs {}

export interface DataTypesRepeatedRefs {}

export type DataTypesContract = JayContract<
    DataTypesViewState,
    DataTypesRefs,
    DataTypesSlowViewState,
    DataTypesFastViewState,
    DataTypesInteractiveViewState
>;
