import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    ConstructContext,
    HTMLElementProxy,
    RenderElementOptions, RenderElement, ReferencesManager,
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
export type ChildElementRender = RenderElement<ChildViewState, ChildElementRefs, ChildElement>
export type ChildElementPreRender = [refs: ChildElementRefs, ChildElementRender]

export function render(options?: RenderElementOptions): ChildElementPreRender {
    const [refManager, [eventToParent, eventToParentToChildProp, eventToParentToChildApi]] =
        ReferencesManager.for(options, ['eventToParent', 'eventToParentToChildProp', 'eventToParentToChildApi'], [], [], []);
    const render = (viewState: ChildViewState) => ConstructContext.withRootContext(
        viewState, refManager,
        () => {
            return e('div', {}, [
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
                    eventToParent(),
                ),
                e(
                    'button',
                    { id: da((vs) => `event-to-parent-to-child-prop-button-${vs.id}`) },
                    ['event to parent, parent update child prop'],
                    eventToParentToChildProp(),
                ),
                e(
                    'button',
                    { id: da((vs) => `event-to-parent-to-child-api-button-${vs.id}`) },
                    ['event to parent, parent calls child api'],
                    eventToParentToChildApi(),
                ),
            ])},
    ) as ChildElement;
    return [refManager.getPublicAPI() as ChildElementRefs, render]
}
