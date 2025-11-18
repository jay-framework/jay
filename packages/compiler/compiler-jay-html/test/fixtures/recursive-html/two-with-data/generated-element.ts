import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    withData,
    dynamicElement as de,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export enum TreeTypeOfTwoWithDataViewState {
    var1,
    var2,
}

export interface TreeOfTwoWithDataViewState {
    value: string;
    id: string;
}

export interface TwoWithDataViewState {
    treeType: TreeTypeOfTwoWithDataViewState;
    tree: TreeOfTwoWithDataViewState;
}

export interface TwoWithDataElementRefs {
    tree: {
        title: HTMLElementProxy<TreeOfTwoWithDataViewState, HTMLSpanElement>;
    };
}

export type TwoWithDataElement = JayElement<TwoWithDataViewState, TwoWithDataElementRefs>;
export type TwoWithDataElementRender = RenderElement<
    TwoWithDataViewState,
    TwoWithDataElementRefs,
    TwoWithDataElement
>;
export type TwoWithDataElementPreRender = [TwoWithDataElementRefs, TwoWithDataElementRender];
export type TwoWithDataContract = JayContract<TwoWithDataViewState, TwoWithDataElementRefs>;

export function render(options?: RenderElementOptions): TwoWithDataElementPreRender {
    const [treeRefManager, [refTitle]] = ReferencesManager.for(options, ['title'], [], [], []);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        tree: treeRefManager,
    });
    const render = (viewState: TwoWithDataViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                c(
                    (vs) => vs.treeType === TreeTypeOfTwoWithDataViewState.var1,
                    () =>
                        de('div', {}, [
                            withData(
                                (vs: TwoWithDataViewState) => vs.tree,
                                () =>
                                    e('div', {}, [
                                        e('span', {}, ['variant 1:'], refTitle()),
                                        e('span', {}, [dt((vs1) => vs1.value)]),
                                    ]),
                            ),
                        ]),
                ),
                c(
                    (vs) => vs.treeType === TreeTypeOfTwoWithDataViewState.var2,
                    () =>
                        de('div', {}, [
                            withData(
                                (vs: TwoWithDataViewState) => vs.tree,
                                () =>
                                    e('div', {}, [
                                        e('span', {}, ['variant 1:'], refTitle()),
                                        e('span', {}, [dt((vs1) => vs1.value)]),
                                    ]),
                            ),
                        ]),
                ),
            ]),
        ) as TwoWithDataElement;
    return [refManager.getPublicAPI() as TwoWithDataElementRefs, render];
}
