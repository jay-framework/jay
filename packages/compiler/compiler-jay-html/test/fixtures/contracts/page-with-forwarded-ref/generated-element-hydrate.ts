import {
    JayElement,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
    adoptText,
    adoptElement,
} from '@jay-framework/runtime';
import { Counter } from '../../components/counter/counter';

export interface PageWithForwardedRefViewState {
    pageTitle: string;
}

export type CounterRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Counter>>;
export interface PageWithForwardedRefElementRefs {
    signupCard: {
        cta: CounterRef<PageWithForwardedRefViewState>;
    };
}

export type PageWithForwardedRefSlowViewState = {};
export type PageWithForwardedRefFastViewState = PageWithForwardedRefViewState;
export type PageWithForwardedRefInteractiveViewState = PageWithForwardedRefViewState;

export type PageWithForwardedRefElement = JayElement<
    PageWithForwardedRefViewState,
    PageWithForwardedRefElementRefs
>;
export type PageWithForwardedRefElementRender = RenderElement<
    PageWithForwardedRefViewState,
    PageWithForwardedRefElementRefs,
    PageWithForwardedRefElement
>;
export type PageWithForwardedRefElementPreRender = [
    PageWithForwardedRefElementRefs,
    PageWithForwardedRefElementRender,
];
export type PageWithForwardedRefContract = JayContract<
    PageWithForwardedRefViewState,
    PageWithForwardedRefElementRefs,
    PageWithForwardedRefSlowViewState,
    PageWithForwardedRefFastViewState,
    PageWithForwardedRefInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithForwardedRefElementPreRender {
    const [signupCardRefManager, [refCta]] = ReferencesManager.for(options, [], [], ['cta'], []);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        signupCard: signupCardRefManager,
    });
    const render = (viewState: PageWithForwardedRefViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                adoptElement('S1/0', {}, [
                    adoptText('S1/0/0', (vs) => 'Sign up'),
                    childComp(
                        Counter,
                        (vs: PageWithForwardedRefViewState) => ({ initialValue: 0 }),
                        refCta(),
                    ),
                ]),
            ]),
        ) as PageWithForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefElementRefs, render];
}
