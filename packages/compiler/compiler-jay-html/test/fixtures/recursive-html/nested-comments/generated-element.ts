import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    conditional as c,
    forEach,
    RenderElement,
    ReferencesManager,
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
}

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
    NestedCommentsElementRefs
>;

export function render(options?: RenderElementOptions): NestedCommentsElementPreRender {
    const [refManager, [refToggleReplies]] = ReferencesManager.for(
        options,
        ['toggleReplies'],
        [],
        [],
        [],
    );

    function renderRecursiveRegion_comment(commentData: NestedCommentsViewState) {
        return de('article', { class: 'comment' }, [
            e('div', { class: 'comment-header' }, [
                e('span', { class: 'author' }, [dt((vs: NestedCommentsViewState) => vs.author)]),
            ]),
            e('div', { class: 'comment-body' }, [
                e('p', { class: 'comment-text' }, [dt((vs: NestedCommentsViewState) => vs.text)]),
            ]),
            e('div', { class: 'comment-actions' }, [
                e('button', {}, ['Toggle Replies'], refToggleReplies()),
            ]),
            c(
                (vs: NestedCommentsViewState) => vs.showReplies,
                () =>
                    de('div', { class: 'replies' }, [
                        forEach(
                            (vs: NestedCommentsViewState) => vs.replies,
                            (replyData: NestedCommentsViewState) => {
                                return e('div', {}, [renderRecursiveRegion_comment(replyData)]);
                            },
                            'id',
                        ),
                    ]),
            ),
        ]);
    }

    const render = (viewState: NestedCommentsViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', { class: 'comments' }, [renderRecursiveRegion_comment(viewState)]),
        ) as NestedCommentsElement;

    return [refManager.getPublicAPI() as NestedCommentsElementRefs, render];
}

