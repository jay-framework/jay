import {
    BaseJayElement,
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface NestedCommentsViewState {
    author: string;
    text: string;
    id: string;
    showReplies: boolean;
    replies: Array<NestedCommentsViewState>;
}

export interface NestedCommentsElementRefs {
    toggleReplies: HTMLElementProxy<NestedCommentsViewState, HTMLButtonElement>;
    comment: HTMLElementProxy<NestedCommentsViewState, HTMLElement>;
}

export type NestedCommentsSlowViewState = {};
export type NestedCommentsFastViewState = {};
export type NestedCommentsInteractiveViewState = NestedCommentsViewState;


export type NestedCommentsElement = JayElement<NestedCommentsViewState, NestedCommentsElementRefs>;
export type NestedCommentsElementRender = RenderElement<
    NestedCommentsViewState,
    NestedCommentsElementRefs,
    NestedCommentsElement
>;
export type NestedCommentsElementPreRender = [
    NestedCommentsElementRefs,
    NestedCommentsElementRender,
];
export type NestedCommentsContract = JayContract<
    NestedCommentsViewState,
    NestedCommentsElementRefs,
    NestedCommentsSlowViewState,
    NestedCommentsFastViewState,
    NestedCommentsInteractiveViewState
>;

export function render(options?: RenderElementOptions): NestedCommentsElementPreRender {
    const [repliesRefManager, []] = ReferencesManager.for(options, [], [], [], []);
    const [refManager, [refToggleReplies, refComment]] = ReferencesManager.for(
        options,
        ['toggleReplies', 'comment'],
        [],
        [],
        [],
        {
            replies: repliesRefManager,
        },
    );

    function renderRecursiveRegion_comment(): BaseJayElement<NestedCommentsViewState> {
        return de(
            'article',
            { class: 'comment' },
            [
                e('div', { class: 'comment-header' }, [
                    e('span', { class: 'author' }, [dt((vs) => vs.author)]),
                ]),
                e('div', { class: 'comment-body' }, [
                    e('p', { class: 'comment-text' }, [dt((vs) => vs.text)]),
                ]),
                e('div', { class: 'comment-actions' }, [
                    e('button', {}, ['Toggle Replies'], refToggleReplies()),
                ]),
                c(
                    (vs) => vs.showReplies,
                    () =>
                        de('div', { class: 'replies' }, [
                            forEach(
                                (vs: NestedCommentsViewState) => vs.replies,
                                (vs1: NestedCommentsViewState) => {
                                    return e('div', {}, [renderRecursiveRegion_comment()]);
                                },
                                'id',
                            ),
                        ]),
                ),
            ],
            refComment(),
        );
    }

    const render = (viewState: NestedCommentsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'comments' }, [renderRecursiveRegion_comment()]),
        ) as NestedCommentsElement;
    return [refManager.getPublicAPI() as NestedCommentsElementRefs, render];
}
