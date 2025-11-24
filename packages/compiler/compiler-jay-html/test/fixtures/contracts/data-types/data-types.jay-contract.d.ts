import { JayContract } from '@jay-framework/runtime';

export interface O1OfDataTypesViewState {
    s2: string;
    n2: number;
}

export interface A1OfDataTypesViewState {
    s3: string;
    n3: number;
}

export interface Po1OfDataTypesViewState {
    ps2: string;
    pn2: number;
}

export interface Pa1OfDataTypesViewState {
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
    o1: Pick<DataTypesViewState['o1'], 's2' | 'n2'>;
} & {
    a1: Array<Pick<DataTypesViewState['a1'][number], 's3' | 'n3'>>;
} & {
    po1: Pick<DataTypesViewState['po1'], 'ps2' | 'pn2'>;
} & {
    pa1: Array<Pick<DataTypesViewState['pa1'][number], 'ps3' | 'pn3'>>;
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
