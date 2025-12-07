import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, ConstructContext, HTMLElementProxy, RenderElementOptions, JayContract} from "@jay-framework/runtime";

export interface PageViewState {
  title: string,
  description: string,
  price: number,
  stock: number
}


export interface PageElementRefs {
  buyButton: HTMLElementProxy<PageViewState, HTMLButtonElement>
}

export type PageSlowViewState = Pick<PageViewState, 'title' | 'description'>;

export type PageFastViewState = Pick<PageViewState, 'price' | 'stock'>;

export type PageInteractiveViewState = Pick<PageViewState, 'stock'>;

export type PageElement = JayElement<PageViewState, PageElementRefs>
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>
export type PageElementPreRender = [PageElementRefs, PageElementRender]
export type PageContract = JayContract<
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;


export function render(options?: RenderElementOptions): PageElementPreRender {
    const [refManager, [refBuyButton]] =
        ReferencesManager.for(options, ['buyButton'], [], [], []);    
    const render = (viewState: PageViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => e('div', {}, [
    e('h1', {}, [    dt(vs => vs.title)]),
    e('p', {}, [    dt(vs => vs.description)]),
    e('p', {}, [    dt(vs => `Price: $${vs.price}`)]),
    e('p', {}, [    dt(vs => `Stock: ${vs.stock}`)]),
    e('button', {}, [    'Buy Now'], refBuyButton())
    ])
    ) as PageElement;
    return [refManager.getPublicAPI() as PageElementRefs, render];
}