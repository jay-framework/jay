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
} from 'jay-runtime';
import {NamedContractViewState, NamedContractRefs} from '../named-counter/named-counter.jay-contract'

export interface PageViewState {
    namedCounter: NamedContractViewState;
}

export interface PageElementRefs {
    namedCounter: NamedContractRefs;
}

export type PageElement = JayElement<
    PageViewState,
    PageElementRefs
>;
export type PageElementRender = RenderElement<
    PageViewState,
    PageElementRefs,
    PageElement
>;
export type PageElementPreRender = [
    PageElementRefs,
    PageElementRender,
];

export function render(options?: RenderElementOptions): PageElementPreRender {
    const [counterRefManager, [add, subtract]] =
        ReferencesManager.for(options, ['add', 'subtract'], [], [], []);
    const [namedCounterRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        counter: counterRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        namedCounter: namedCounterRefManager,
    });
    const render = (viewState: PageViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.namedCounter.title)]),
                e('div', {}, [dt((vs) => `value: ${vs.namedCounter.counter.count}`)]),
                e('button', {}, ['add'], add()),
                e('button', {}, ['subtract'], subtract()),
            ]),
        ) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}
