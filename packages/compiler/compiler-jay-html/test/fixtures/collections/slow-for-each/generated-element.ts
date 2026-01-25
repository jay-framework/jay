import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    slowForEachItem,
    ConstructContext,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ProductOfSlowForEachViewState {
    id: string;
    name: string;
    price: number;
}

export interface SlowForEachViewState {
    products: Array<ProductOfSlowForEachViewState>;
}

export interface SlowForEachElementRefs {}

export type SlowForEachSlowViewState = {};
export type SlowForEachFastViewState = {};
export type SlowForEachInteractiveViewState = SlowForEachViewState;

export type SlowForEachElement = JayElement<SlowForEachViewState, SlowForEachElementRefs>;
export type SlowForEachElementRender = RenderElement<
    SlowForEachViewState,
    SlowForEachElementRefs,
    SlowForEachElement
>;
export type SlowForEachElementPreRender = [SlowForEachElementRefs, SlowForEachElementRender];
export type SlowForEachContract = JayContract<
    SlowForEachViewState,
    SlowForEachElementRefs,
    SlowForEachSlowViewState,
    SlowForEachFastViewState,
    SlowForEachInteractiveViewState
>;

export function render(options?: RenderElementOptions): SlowForEachElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: SlowForEachViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('ul', {}, [
                slowForEachItem<SlowForEachViewState, ProductOfSlowForEachViewState>(
                    'products',
                    0,
                    'p1',
                    () =>
                        e('li', {}, [
                            e('span', { class: 'name' }, ['Widget A']),
                            e('span', { class: 'price' }, [dt((vs1) => vs1.price)]),
                        ]),
                ),
                slowForEachItem<SlowForEachViewState, ProductOfSlowForEachViewState>(
                    'products',
                    1,
                    'p2',
                    () =>
                        e('li', {}, [
                            e('span', { class: 'name' }, ['Widget B']),
                            e('span', { class: 'price' }, [dt((vs1) => vs1.price)]),
                        ]),
                ),
            ]),
        ) as SlowForEachElement;
    return [refManager.getPublicAPI() as SlowForEachElementRefs, render];
}
