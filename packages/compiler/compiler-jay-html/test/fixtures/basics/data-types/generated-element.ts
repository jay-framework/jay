import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

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

export interface DataTypesElementRefs {}

export type DataTypesSlowViewState = {};
export type DataTypesFastViewState = {};
export type DataTypesInteractiveViewState = DataTypesViewState;

export type DataTypesElement = JayElement<DataTypesViewState, DataTypesElementRefs>;
export type DataTypesElementRender = RenderElement<
    DataTypesViewState,
    DataTypesElementRefs,
    DataTypesElement
>;
export type DataTypesElementPreRender = [DataTypesElementRefs, DataTypesElementRender];
export type DataTypesContract = JayContract<
    DataTypesViewState,
    DataTypesElementRefs,
    DataTypesSlowViewState,
    DataTypesFastViewState,
    DataTypesInteractiveViewState
>;

export function render(options?: RenderElementOptions): DataTypesElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: DataTypesViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('span', {}, [dt((vs) => vs.s1)]),
                e('span', {}, [dt((vs) => vs.n1)]),
                e('span', {}, [dt((vs) => vs.b1)]),
                e('span', {}, [dt((vs) => vs.o1?.s2)]),
                e('span', {}, [dt((vs) => vs.o1?.n2)]),
            ]),
        ) as DataTypesElement;
    return [refManager.getPublicAPI() as DataTypesElementRefs, render];
}
