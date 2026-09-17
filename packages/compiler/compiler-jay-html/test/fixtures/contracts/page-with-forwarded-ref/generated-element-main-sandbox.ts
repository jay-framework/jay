import {JayElement, element as e, dynamicText as dt, RenderElement, ReferencesManager, ConstructContext, childComp, RenderElementOptions, MapEventEmitterViewState, JayContract} from "@jay-framework/runtime";
import {secureChildComp} from "@jay-framework/secure";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
// @ts-ignore
import {Counter} from "../../components/counter/counter?jay-mainSandbox";
// @ts-ignore
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract?jay-mainSandbox";

export interface PageWithForwardedRefViewState {
  pageTitle: string
}


export interface PageWithForwardedRefElementRefs {
  signupCard: _HeadlessCard0Refs
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface _HeadlessCard0Refs {
  cta: CounterRef<CardViewState>
}

export type PageWithForwardedRefSlowViewState = {};
export type PageWithForwardedRefFastViewState = PageWithForwardedRefViewState;
export type PageWithForwardedRefInteractiveViewState = PageWithForwardedRefViewState;

export type PageWithForwardedRefElement = JayElement<PageWithForwardedRefViewState, PageWithForwardedRefElementRefs>
export type PageWithForwardedRefElementRender = RenderElement<PageWithForwardedRefViewState, PageWithForwardedRefElementRefs, PageWithForwardedRefElement>
export type PageWithForwardedRefElementPreRender = [PageWithForwardedRefElementRefs, PageWithForwardedRefElementRender]
export type PageWithForwardedRefContract = JayContract<
    PageWithForwardedRefViewState,
    PageWithForwardedRefElementRefs,
    PageWithForwardedRefSlowViewState,
    PageWithForwardedRefFastViewState,
    PageWithForwardedRefInteractiveViewState
>;



// Inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, _HeadlessCard0Refs>;
type _HeadlessCard0ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard0Refs, _HeadlessCard0Element>;
type _HeadlessCard0ElementPreRender = [_HeadlessCard0Refs, _HeadlessCard0ElementRender];

function _headlessCard0Render(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
        const [refManager, [refCta]] =
        ReferencesManager.for(options, [], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
e('div', {class: 'card'}, [
e('h3', {}, [dt(vs => vs.heading)]),
secureChildComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta())
])
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as _HeadlessCard0Refs, render];
}

const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0Render,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    'S0/0/card:signupCard',
);

export function render(options?: RenderElementOptions): PageWithForwardedRefElementPreRender {
    const [refManager, [refSignupCard]] =
        ReferencesManager.for(options, [], [], ['signupCard'], []);    
    const render = (viewState: PageWithForwardedRefViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => e('div', {}, [
    e('h1', {}, [    dt(vs => vs.pageTitle)]),
    childComp(_HeadlessCard0, (vs: PageWithForwardedRefViewState) => ({heading: 'Sign up', jc: 'card'}), refSignupCard())
    ])
    ) as PageWithForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefElementRefs, render];
}