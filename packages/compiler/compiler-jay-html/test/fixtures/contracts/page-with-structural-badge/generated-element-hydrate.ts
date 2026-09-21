import {
    JayElement,
    element as e,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    hydrateConditional,
    adoptDynamicElement,
    classNames as cx,
} from '@jay-framework/runtime';
import { Status } from './badge/badge.jay-contract';

export interface PageWithStructuralBadgeViewState {
    pageTitle: string;
}

export interface PageWithStructuralBadgeElementRefs {}

export type PageWithStructuralBadgeSlowViewState = {};
export type PageWithStructuralBadgeFastViewState = PageWithStructuralBadgeViewState;
export type PageWithStructuralBadgeInteractiveViewState = PageWithStructuralBadgeViewState;

export type PageWithStructuralBadgeElement = JayElement<
    PageWithStructuralBadgeViewState,
    PageWithStructuralBadgeElementRefs
>;
export type PageWithStructuralBadgeElementRender = RenderElement<
    PageWithStructuralBadgeViewState,
    PageWithStructuralBadgeElementRefs,
    PageWithStructuralBadgeElement
>;
export type PageWithStructuralBadgeElementPreRender = [
    PageWithStructuralBadgeElementRefs,
    PageWithStructuralBadgeElementRender,
];
export type PageWithStructuralBadgeContract = JayContract<
    PageWithStructuralBadgeViewState,
    PageWithStructuralBadgeElementRefs,
    PageWithStructuralBadgeSlowViewState,
    PageWithStructuralBadgeFastViewState,
    PageWithStructuralBadgeInteractiveViewState
>;

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithStructuralBadgeElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithStructuralBadgeViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                adoptDynamicElement(
                    'S1/0',
                    {
                        class: da((vs) =>
                            cx(
                                'badge',
                                (Status.success as Status) === Status.success
                                    ? 'badge--success'
                                    : '',
                                (Status.success as Status) === Status.warning
                                    ? 'badge--warning'
                                    : '',
                                (Status.success as Status) === Status.error ? 'badge--error' : '',
                            ),
                        ),
                    },
                    [
                        hydrateConditional(
                            (vs) => (Status.success as Status) === Status.success,
                            () => adoptElement('S1/0/0', {}, []),
                            () => e('span', { class: 'badge-icon badge-icon--success' }, ['[OK]']),
                        ),
                        hydrateConditional(
                            (vs) => (Status.success as Status) === Status.warning,
                            () => adoptElement('S1/0/1', {}, []),
                            () => e('span', { class: 'badge-icon badge-icon--warning' }, ['[!]']),
                        ),
                        hydrateConditional(
                            (vs) => (Status.success as Status) === Status.error,
                            () => adoptElement('S1/0/2', {}, []),
                            () => e('span', { class: 'badge-icon badge-icon--error' }, ['[X]']),
                        ),
                        adoptText('S1/0/3', (vs) => 'Live Status'),
                        adoptText('S1/0/4', (vs) => `Count: ${42}`),
                        hydrateConditional(
                            (vs) => true,
                            () => adoptElement('S1/0/5', {}, []),
                            () => e('span', { class: 'badge-star' }, ['FEATURED']),
                        ),
                    ],
                ),
            ]),
        ) as PageWithStructuralBadgeElement;
    return [refManager.getPublicAPI() as PageWithStructuralBadgeElementRefs, render];
}
