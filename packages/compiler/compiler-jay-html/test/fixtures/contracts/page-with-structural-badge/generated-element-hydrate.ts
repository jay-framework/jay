import {
    JayElement,
    element as e,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    adoptText,
    adoptElement,
    childCompHydrate,
    hydrateConditional,
    adoptDynamicElement,
} from '@jay-framework/runtime';
import { makeHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import {
    BadgeViewState,
    BadgeRefs,
    Status,
    BadgeInteractiveViewState,
} from './badge/badge.jay-contract';

export interface PageWithStructuralBadgeViewState {
    pageTitle: string;
}

export interface PageWithStructuralBadgeElementRefs {
    ar0: BadgeRefs;
}

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

// Hydrate inline template for headless component: badge #0
type _HeadlessBadge0Element = JayElement<BadgeInteractiveViewState, BadgeRefs>;
type _HeadlessBadge0ElementRender = RenderElement<
    BadgeInteractiveViewState,
    BadgeRefs,
    _HeadlessBadge0Element
>;
type _HeadlessBadge0ElementPreRender = [BadgeRefs, _HeadlessBadge0ElementRender];

function _headlessBadge0HydrateRender(
    options?: RenderElementOptions,
): _HeadlessBadge0ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationChildContext(viewState, refManager, () =>
            adoptDynamicElement(
                'S1/0',
                {
                    class: da(
                        (vs) =>
                            `badge ${vs.status === Status.success ? 'badge--success' : ''} ${vs.status === Status.warning ? 'badge--warning' : ''} ${vs.status === Status.error ? 'badge--error' : ''}`,
                    ),
                },
                [
                    hydrateConditional(
                        (vs) => vs.status === Status.success,
                        () => adoptElement('S1/0/0', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--success' }, ['[OK]']),
                    ),
                    hydrateConditional(
                        (vs) => vs.status === Status.warning,
                        () => adoptElement('S1/0/1', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--warning' }, ['[!]']),
                    ),
                    hydrateConditional(
                        (vs) => vs.status === Status.error,
                        () => adoptElement('S1/0/2', {}, []),
                        () => e('span', { class: 'badge-icon badge-icon--error' }, ['[X]']),
                    ),
                    adoptText('S1/0/3', (vs) => vs.label),
                    adoptText('S1/0/4', (vs) => `Count: ${vs.count}`),
                    hydrateConditional(
                        (vs) => vs.featured,
                        () => adoptElement('S1/0/5', {}, []),
                        () => e('span', { class: 'badge-star' }, ['FEATURED']),
                    ),
                ],
            ),
        ) as _HeadlessBadge0Element;
    return [refManager.getPublicAPI() as BadgeRefs, render];
}
const _HeadlessBadge0 = makeHeadlessInstanceComponent(
    _headlessBadge0HydrateRender,
    { comp: (_props, _refs) => ({ render: () => _props }) },
    'S0/0/badge:AR0',
);

export function hydrate(
    rootElement: Element,
    options?: RenderElementOptions,
): PageWithStructuralBadgeElementPreRender {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState: PageWithStructuralBadgeViewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('S0/0', {}, [
                adoptText('S0/0/0', (vs) => vs.pageTitle),
                childCompHydrate(
                    _HeadlessBadge0,
                    (vs: PageWithStructuralBadgeViewState) => ({
                        label: 'Live Status',
                        status: Status.success,
                        count: 42,
                        featured: true,
                        jc: 'badge',
                    }),
                    'S1/0',
                    refAr0(),
                ),
            ]),
        ) as PageWithStructuralBadgeElement;
    return [refManager.getPublicAPI() as PageWithStructuralBadgeElementRefs, render];
}
