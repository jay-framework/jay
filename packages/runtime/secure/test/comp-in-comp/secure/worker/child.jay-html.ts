import {
    JayElement,
    HTMLElementProxy,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';
import { elementBridge, SecureReferencesManager } from '../../../../lib';
import { sandboxElement as e } from '../../../../lib/';

export interface ChildViewState {
    textFromProp: string;
    textFromAPI: string;
}

export interface ChildElementRefs {
    eventToParent: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
    eventToParentToChildProp: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
    eventToParentToChildApi: HTMLElementProxy<ChildViewState, HTMLButtonElement>;
}

export type ChildElement = JayElement<ChildViewState, ChildElementRefs>;
export type ChildElementRender = RenderElement<ChildViewState, ChildElementRefs, ChildElement>;
export type ChildElementPreRender = [refs: ChildElementRefs, ChildElementRender];

export function render(): ChildElementPreRender {
    const [refManager, [eventToParent, eventToParentToChildProp, eventToParentToChildApi]] =
        SecureReferencesManager.forElement(
            ['eventToParent', 'eventToParentToChildProp', 'eventToParentToChildApi'],
            [],
            [],
            [],
        );
    const render = (viewState: ChildViewState) =>
        elementBridge(viewState, refManager, () => [
            e(eventToParent()),
            e(eventToParentToChildProp()),
            e(eventToParentToChildApi()),
        ]) as ChildElement;
    return [refManager.getPublicAPI() as ChildElementRefs, render];
}
