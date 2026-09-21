import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    MapEventEmitterViewState,
    JayContract,
} from '@jay-framework/runtime';
import { secureChildComp } from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { Counter } from '../../components/counter/counter?jay-mainSandbox';

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

export function render(options?: RenderElementOptions): PageWithForwardedRefElementPreRender {
    const [signupCardRefManager, [refCta]] = ReferencesManager.for(options, [], [], ['cta'], []);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        signupCard: signupCardRefManager,
    });
    const render = (viewState: PageWithForwardedRefViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                e('div', { class: 'card' }, [
                    e('h3', {}, [dt((vs) => 'Sign up')]),
                    secureChildComp(
                        Counter,
                        (vs: PageWithForwardedRefViewState) => ({ initialValue: 0 }),
                        refCta(),
                    ),
                ]),
            ]),
        ) as PageWithForwardedRefElement;
    return [refManager.getPublicAPI() as PageWithForwardedRefElementRefs, render];
}
