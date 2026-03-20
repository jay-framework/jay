import {
    JayElement,
    element as e,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { CounterViewState, CounterRefs, IsPositive } from '../counter/counter.jay-contract';

export interface PageUsingCounterViewState {
    counter?: CounterViewState;
}

export interface PageUsingCounterElementRefs {
    counter: CounterRefs;
}

export type PageUsingCounterSlowViewState = {};
export type PageUsingCounterFastViewState = {};
export type PageUsingCounterInteractiveViewState = PageUsingCounterViewState;

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
export type PageUsingCounterContract = JayContract<
    PageUsingCounterViewState,
    PageUsingCounterElementRefs,
    PageUsingCounterSlowViewState,
    PageUsingCounterFastViewState,
    PageUsingCounterInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageUsingCounterElementPreRender {
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
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => `value: ${vs.counter?.count}`),
                adoptElement('0/1', {}, [], refAdd()),
                adoptElement('0/2', {}, [], refSubtract()),
                adoptDynamicElement('0/3', {}, [
                    hydrateConditional(
                        (vs) => vs.counter?.isPositive === IsPositive.positive,
                        () => adoptElement('0/3/0', {}, []),
                        () => e('img', { src: 'positive.jpg', alt: 'positive' }, []),
                    ),
                    hydrateConditional(
                        (vs) => vs.counter?.isPositive === IsPositive.negative,
                        () => adoptElement('0/3/1', {}, []),
                        () => e('img', { src: 'negative.jpg', alt: 'negative' }, []),
                    ),
                ]),
            ]),
        ) as PageUsingCounterElement;
    return [refManager.getPublicAPI() as PageUsingCounterElementRefs, render];
}
