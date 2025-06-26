import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from 'jay-runtime';

export interface AutoCounterViewState {
    count: number;
}

export interface AutoCounterElementRefs {
    autoCount1: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
    autoCount2: HTMLElementProxy<AutoCounterViewState, HTMLButtonElement>;
}

export type AutoCounterElement = JayElement<AutoCounterViewState, AutoCounterElementRefs>;
export type AutoCounterElementRender = RenderElement<
    AutoCounterViewState,
    AutoCounterElementRefs,
    AutoCounterElement
>;
export type AutoCounterElementPreRender = [AutoCounterElementRefs, AutoCounterElementRender];
export type AutoCounterContract = JayContract<AutoCounterViewState, AutoCounterElementRefs>;

export function render(options?: RenderElementOptions): AutoCounterElementPreRender {
    const [refManager, [refAutoCount1, refAutoCount2]] = ReferencesManager.for(
        options,
        ['autoCount1', 'autoCount2'],
        [],
        [],
        [],
    );
    const render = (viewState: AutoCounterViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('span', { style: { cssText: 'margin: 0 16px' } }, [dt((vs) => vs.count)]),
                e(
                    'button',
                    {},
                    ['Count using animation frames to 1000, from component file'],
                    refAutoCount1(),
                ),
                e(
                    'button',
                    {},
                    ['Count using animation frames to 1000, from imported file'],
                    refAutoCount2(),
                ),
            ]),
        ) as AutoCounterElement;
    return [refManager.getPublicAPI() as AutoCounterElementRefs, render];
}
