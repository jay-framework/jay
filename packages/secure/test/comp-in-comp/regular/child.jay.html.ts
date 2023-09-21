import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    ConstructContext,
    HTMLElementProxy,
    elemRef as er,
    RenderElementOptions,
} from 'jay-runtime';

export interface ChildViewState {
    textFromProp: string;
    textFromAPI: string;
    id: string;
}

export interface ChildElementRefs {
    eventToParent: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
    eventToParentToChildProp: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
    eventToParentToChildApi: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>;

export function render(viewState: ChildViewState, options?: RenderElementOptions): ChildElement {
    return ConstructContext.withRootContext(
        viewState,
        () =>
            e('div', {}, [
                e('div', { id: da((vs) => `child-text-from-prop-${vs.id}`) }, [
                    dt((vs) => vs.textFromProp),
                ]),
                e('div', { id: da((vs) => `child-text-from-api-${vs.id}`) }, [
                    dt((vs) => vs.textFromAPI),
                ]),
                e(
                    'button',
                    { id: da((vs) => `event-to-parent-button-${vs.id}`) },
                    ['event to parent'],
                    er('eventToParent'),
                ),
                e(
                    'button',
                    { id: da((vs) => `event-to-parent-to-child-prop-button-${vs.id}`) },
                    ['event to parent, parent update child prop'],
                    er('eventToParentToChildProp'),
                ),
                e(
                    'button',
                    { id: da((vs) => `event-to-parent-to-child-api-button-${vs.id}`) },
                    ['event to parent, parent calls child api'],
                    er('eventToParentToChildApi'),
                ),
            ]),
        options,
    );
}
