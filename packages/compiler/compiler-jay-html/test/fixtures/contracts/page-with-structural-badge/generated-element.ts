import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
    classNames as cx,
} from '@jay-framework/runtime';
import { makePassthroughHeadlessInstanceComponent } from '@jay-framework/stack-client-runtime';
import { BadgeRefs, Status, BadgeInteractiveViewState } from './badge/badge.jay-contract';

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

// Inline template for headless component: badge #0
type _HeadlessBadge0Element = JayElement<BadgeInteractiveViewState, BadgeRefs>;
type _HeadlessBadge0ElementRender = RenderElement<
    BadgeInteractiveViewState,
    BadgeRefs,
    _HeadlessBadge0Element
>;
type _HeadlessBadge0ElementPreRender = [BadgeRefs, _HeadlessBadge0ElementRender];

function _headlessBadge0Render(options?: RenderElementOptions): _HeadlessBadge0ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de(
                'span',
                {
                    class: da((vs) =>
                        cx(
                            'badge',
                            vs.status === Status.success ? 'badge--success' : '',
                            vs.status === Status.warning ? 'badge--warning' : '',
                            vs.status === Status.error ? 'badge--error' : '',
                        ),
                    ),
                },
                [
                    c(
                        (vs) => vs.status === Status.success,
                        () => e('span', { class: 'badge-icon badge-icon--success' }, ['[OK]']),
                    ),
                    c(
                        (vs) => vs.status === Status.warning,
                        () => e('span', { class: 'badge-icon badge-icon--warning' }, ['[!]']),
                    ),
                    c(
                        (vs) => vs.status === Status.error,
                        () => e('span', { class: 'badge-icon badge-icon--error' }, ['[X]']),
                    ),
                    e('span', { class: 'badge-label' }, [dt((vs) => vs.label)]),
                    e('span', { class: 'badge-count' }, [dt((vs) => `Count: ${vs.count}`)]),
                    c(
                        (vs) => vs.featured,
                        () => e('span', { class: 'badge-star' }, ['FEATURED']),
                    ),
                ],
            ),
        ) as _HeadlessBadge0Element;
    return [refManager.getPublicAPI() as BadgeRefs, render];
}

const _HeadlessBadge0 = makePassthroughHeadlessInstanceComponent(
    _headlessBadge0Render,
    'S0/0/badge:AR0',
);

export function render(options?: RenderElementOptions): PageWithStructuralBadgeElementPreRender {
    const [refManager, [refAr0]] = ReferencesManager.for(options, [], [], ['ar0'], []);
    const render = (viewState: PageWithStructuralBadgeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                childComp(
                    _HeadlessBadge0,
                    (vs: PageWithStructuralBadgeViewState) => ({
                        label: 'Live Status',
                        status: Status.success,
                        count: 42,
                        featured: true,
                    }),
                    refAr0(),
                ),
            ]),
        ) as PageWithStructuralBadgeElement;
    return [refManager.getPublicAPI() as PageWithStructuralBadgeElementRefs, render];
}
