import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface CellOfRowOfForeachParentBindingGrandparentViewState {
    id: string;
    label: string;
}

export interface RowOfForeachParentBindingGrandparentViewState {
    id: string;
    cells: Array<CellOfRowOfForeachParentBindingGrandparentViewState>;
}

export interface ForeachParentBindingGrandparentViewState {
    title: string;
    rows: Array<RowOfForeachParentBindingGrandparentViewState>;
}

export interface ForeachParentBindingGrandparentElementRefs {}

export type ForeachParentBindingGrandparentSlowViewState = {};
export type ForeachParentBindingGrandparentFastViewState = ForeachParentBindingGrandparentViewState;
export type ForeachParentBindingGrandparentInteractiveViewState =
    ForeachParentBindingGrandparentViewState;

export type ForeachParentBindingGrandparentElement = JayElement<
    ForeachParentBindingGrandparentViewState,
    ForeachParentBindingGrandparentElementRefs
>;
export type ForeachParentBindingGrandparentElementRender = RenderElement<
    ForeachParentBindingGrandparentViewState,
    ForeachParentBindingGrandparentElementRefs,
    ForeachParentBindingGrandparentElement
>;
export type ForeachParentBindingGrandparentElementPreRender = [
    ForeachParentBindingGrandparentElementRefs,
    ForeachParentBindingGrandparentElementRender,
];
export type ForeachParentBindingGrandparentContract = JayContract<
    ForeachParentBindingGrandparentViewState,
    ForeachParentBindingGrandparentElementRefs,
    ForeachParentBindingGrandparentSlowViewState,
    ForeachParentBindingGrandparentFastViewState,
    ForeachParentBindingGrandparentInteractiveViewState
>;

export function render(
    options?: RenderElementOptions,
): ForeachParentBindingGrandparentElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: ForeachParentBindingGrandparentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('table', {}, [
                forEach(
                    (vs: ForeachParentBindingGrandparentViewState) => vs.rows,
                    (vs1: RowOfForeachParentBindingGrandparentViewState) => {
                        return de('tr', {}, [
                            forEach(
                                (vs1: RowOfForeachParentBindingGrandparentViewState) => vs1.cells,
                                (vs2: CellOfRowOfForeachParentBindingGrandparentViewState) => {
                                    return e('td', { class: 'cell' }, [
                                        dt((vs2, _p1, _p2) => _p2.title),
                                    ]);
                                },
                                'id',
                                true,
                            ),
                        ]);
                    },
                    'id',
                    true,
                ),
            ]),
        ) as ForeachParentBindingGrandparentElement;
    return [refManager.getPublicAPI() as ForeachParentBindingGrandparentElementRefs, render];
}
