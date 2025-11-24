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

export interface O1OfDataTypesSlowViewState {
    s2: string;
    n2: number;
}

export interface A1OfDataTypesSlowViewState {
    s3: string;
    n3: number;
}

export interface Po1OfDataTypesSlowViewState {
    ps2: string;
    pn2: number;
}

export interface Pa1OfDataTypesSlowViewState {
    ps3: string;
    pn3: number;
}

export interface DataTypesSlowViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1OfDataTypesSlowViewState;
    a1: Array<A1OfDataTypesSlowViewState>;
    p1: Promise<string>;
    po1: Promise<Po1OfDataTypesSlowViewState>;
    pa1: Promise<Array<Pa1OfDataTypesSlowViewState>>;
}

export interface O1OfDataTypesFastViewState {
    s2: string;
    n2: number;
}

export interface A1OfDataTypesFastViewState {
    s3: string;
    n3: number;
}

export interface Po1OfDataTypesFastViewState {
    ps2: string;
    pn2: number;
}

export interface Pa1OfDataTypesFastViewState {
    ps3: string;
    pn3: number;
}

export interface DataTypesFastViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1OfDataTypesFastViewState;
    a1: Array<A1OfDataTypesFastViewState>;
    p1: Promise<string>;
    po1: Promise<Po1OfDataTypesFastViewState>;
    pa1: Promise<Array<Pa1OfDataTypesFastViewState>>;
}

export interface O1OfDataTypesInteractiveViewState {
    s2: string;
    n2: number;
}

export interface A1OfDataTypesInteractiveViewState {
    s3: string;
    n3: number;
}

export interface Po1OfDataTypesInteractiveViewState {
    ps2: string;
    pn2: number;
}

export interface Pa1OfDataTypesInteractiveViewState {
    ps3: string;
    pn3: number;
}

export interface DataTypesInteractiveViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1OfDataTypesInteractiveViewState;
    a1: Array<A1OfDataTypesInteractiveViewState>;
    p1: Promise<string>;
    po1: Promise<Po1OfDataTypesInteractiveViewState>;
    pa1: Promise<Array<Pa1OfDataTypesInteractiveViewState>>;
}

export interface DataTypesRefs {}

export interface DataTypesRepeatedRefs {}

export type DataTypesContract = JayContract<
    DataTypesViewState,
    DataTypesRefs,
    DataTypesSlowViewState,
    DataTypesFastViewState,
    DataTypesInteractiveViewState
>;
