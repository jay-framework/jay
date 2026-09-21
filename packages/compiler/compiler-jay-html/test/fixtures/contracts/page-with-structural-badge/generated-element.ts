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
    RenderElementOptions,
    JayContract,
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

export function render(options?: RenderElementOptions): PageWithStructuralBadgeElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: PageWithStructuralBadgeViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('h1', {}, [dt((vs) => vs.pageTitle)]),
                de(
                    'span',
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
                        c(
                            (vs) => (Status.success as Status) === Status.success,
                            () => e('span', { class: 'badge-icon badge-icon--success' }, ['[OK]']),
                        ),
                        c(
                            (vs) => (Status.success as Status) === Status.warning,
                            () => e('span', { class: 'badge-icon badge-icon--warning' }, ['[!]']),
                        ),
                        c(
                            (vs) => (Status.success as Status) === Status.error,
                            () => e('span', { class: 'badge-icon badge-icon--error' }, ['[X]']),
                        ),
                        e('span', { class: 'badge-label' }, [dt((vs) => 'Live Status')]),
                        e('span', { class: 'badge-count' }, [dt((vs) => `Count: ${42}`)]),
                        c(
                            (vs) => true,
                            () => e('span', { class: 'badge-star' }, ['FEATURED']),
                        ),
                    ],
                ),
            ]),
        ) as PageWithStructuralBadgeElement;
    return [refManager.getPublicAPI() as PageWithStructuralBadgeElementRefs, render];
}
