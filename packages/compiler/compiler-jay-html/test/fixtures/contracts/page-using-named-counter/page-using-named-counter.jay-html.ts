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
    JayContract,
} from 'jay-runtime';
import {
    NamedContractViewState,
    NamedContractRefs,
} from '../named-counter/named-counter.jay-contract';
import { IsPositive } from '../counter/counter.jay-contract';

export interface PageUsingNamedCounterViewState {
    namedCounter: NamedContractViewState;
}

export interface PageUsingNamedCounterElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageUsingNamedCounterElement = JayElement<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs
>;
export type PageUsingNamedCounterElementRender = RenderElement<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterElement
>;
export type PageUsingNamedCounterElementPreRender = [
    PageUsingNamedCounterElementRefs,
    PageUsingNamedCounterElementRender,
];
export type PageUsingNamedCounterContract = JayContract<
    PageUsingNamedCounterViewState,
    PageUsingNamedCounterElementRefs
>;

export function render(options?: RenderElementOptions): PageUsingNamedCounterElementPreRender {
    const [counterRefManager, [refAdd, refSubtract]] = ReferencesManager.for(
        options,
        ['add', 'subtract'],
        [],
        [],
        [],
    );
    const [namedCounterRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        counter: counterRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        namedCounter: namedCounterRefManager,
    });
    const render = (viewState: PageUsingNamedCounterViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.namedCounter?.title)]),
                e('div', {}, [dt((vs) => `value: ${vs.namedCounter?.counter?.count}`)]),
                e('button', {}, ['add'], refAdd()),
                e('button', {}, ['subtract'], refSubtract()),
                de('div', {}, [
                    c(
                        (vs) => vs.namedCounter?.counter?.isPositive === IsPositive.positive,
                        () => e('img', { src: 'positive.jpg', alt: 'positive' }, []),
                    ),
                    c(
                        (vs) => vs.namedCounter?.counter?.isPositive === IsPositive.negative,
                        () => e('img', { src: 'negative.jpg', alt: 'negative' }, []),
                    ),
                ]),
            ]),
        ) as PageUsingNamedCounterElement;
    return [refManager.getPublicAPI() as PageUsingNamedCounterElementRefs, render];
}
