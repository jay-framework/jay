import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import {
    CounterViewState,
    CounterRefs,
    IsPositive
} from '../counter/counter.jay-contract';

export interface PageUsingCounterViewState {
    counter: CounterViewState;
}

export interface PageUsingCounterElementRefs {
    counter: CounterRefs;
}

export type PageUsingCounterElement = JayElement<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs
>;
export type PageUsingCounterElementRender = RenderElement<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs,
    PageUsingCounterElement
>;
export type PageUsingCounterElementPreRender = [
    PageUsingCounterElementRefs,
    PageUsingCounterElementRender,
];

export function render(options?: RenderElementOptions): PageUsingCounterElementPreRender {
    const [counterRefManager, [refAdd, refSubtract]] = ReferencesManager.for(
        options,
        ['add', 'subtract'],
        [],
        [],
        [],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        counter: counterRefManager,
    });
    const render = (viewState: PageUsingCounterViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => `value: ${vs.counter?.count}`)]),
                e('button', {}, ['add'], refAdd()),
                e('button', {}, ['subtract'], refSubtract()),
                de('div', {}, [
                    c(
                        (vs) => vs.counter?.isPositive === IsPositive.positive,
                        () => e('img', { src: 'positive.jpg', alt: 'positive' }, []),
                    ),
                    c(
                        (vs) => vs.counter?.isPositive === IsPositive.negative,
                        () => e('img', { src: 'negative.jpg', alt: 'negative' }, []),
                    ),
                ]),
            ]),
        ) as PageUsingCounterElement;
    return [refManager.getPublicAPI() as PageUsingCounterElementRefs, render];
}
