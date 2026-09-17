import {JayElement, RenderElement, ReferencesManager, ConstructContext, childComp, RenderElementOptions, MapEventEmitterViewState, JayContract, adoptText, adoptElement, childCompHydrate} from "@jay-framework/runtime";
import {makeHeadlessInstanceComponent} from "@jay-framework/stack-client-runtime";
import {Counter} from "../../components/counter/counter";
import {CardViewState, CardRefs, CardInteractiveViewState} from "./card/card.jay-contract";

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



// Hydrate inline template for headless component: card #0
type _HeadlessCard0Element = JayElement<CardInteractiveViewState, _HeadlessCard0Refs>;
type _HeadlessCard0ElementRender = RenderElement<CardInteractiveViewState, _HeadlessCard0Refs, _HeadlessCard0Element>;
type _HeadlessCard0ElementPreRender = [_HeadlessCard0Refs, _HeadlessCard0ElementRender];

function _headlessCard0HydrateRender(options?: RenderElementOptions): _HeadlessCard0ElementPreRender {
        const [refManager, [refCta]] =
        ReferencesManager.for(options, [], [], ['cta'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptElement("S1/0", {}, [            adoptText("S1/0/0", vs => vs.heading),
            childComp(Counter, (vs: CardViewState) => ({initialValue: 0}), refCta())])
        ) as _HeadlessCard0Element;
    return [refManager.getPublicAPI() as _HeadlessCard0Refs, render];
}
const _HeadlessCard0 = makeHeadlessInstanceComponent(
    _headlessCard0HydrateRender,
    { comp: (_props, _refs) => ({ render: () => _props, ..._refs }) },
    'S0/0/card:signupCard',
);

export function hydrate(rootElement: Element, options?: RenderElementOptions): PageWithForwardedRefElementPreRender {
    const [refManager, [refSignupCard]] =
        ReferencesManager.for(options, [], [], ['signupCard'], []);
    const render = (viewState: PageWithForwardedRefViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
        adoptElement("S0/0", {}, [        adoptText("S0/0/0", vs => vs.pageTitle),
        childCompHydrate(_HeadlessCard0, (vs: PageWithForwardedRefViewState) => ({heading: 'Sign up', jc: 'card'}), 'S1/0', refSignupCard())])) as PageWithForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefElementRefs, render];
}