import {JayElement, HTMLElementProxy, RenderElement, RenderElementOptions, ReferencesManager} from 'jay-runtime';
import {elementBridge, SecureReferencesManager} from '../../../../lib';
import {
    sandboxElement as e,
    sandboxChildComp as childComp,
    sandboxForEach as forEach,
} from '../../../../lib/';
import { Child } from './child';
import {ChildComponentType, ChildRefs} from '../main/child-refs';

export interface DynamicChild {
    id: string;
    childText: string;
}

export interface ParentViewState {
    textFromChildEvent: string;
    viewStateFromChildEvent: string;
    coordinateFromChildEvent: string;
    childText: string;
    dynamicChildren: Array<DynamicChild>;
}

export interface ParentElementRefs {
    parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    staticChild: ChildComponentType<ParentViewState>;
    dynamicChildren: ChildRefs<DynamicChild>;
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>;
export type ParentElementRender = RenderElement<ParentViewState, ParentElementRefs, ParentElement>
export type ParentElementPreRender = [refs: ParentElementRefs, ParentElementRender]

export function render(): ParentElementPreRender {
    const [refManager, [parentChangesChildPropButton, parentCallsChildApiButton, staticChild, dynamicChildren]] =
        SecureReferencesManager.forElement( ['parentChangesChildPropButton', 'parentCallsChildApiButton'], [], ['staticChild'], ['dynamicChildren']);
    const render = (viewState: ParentViewState) => elementBridge(viewState, refManager, () => {
        return [
            e(parentChangesChildPropButton()),
            e(parentCallsChildApiButton()),
            childComp(
                Child,
                (vs) => ({textFromParent: vs.childText, id: 'static'}),
                staticChild(),
            ),
            forEach(
                (vs) => vs.dynamicChildren,
                'id',
                () => [
                    childComp(
                        Child,
                        (vs: DynamicChild) => ({textFromParent: vs.childText, id: vs.id}),
                        dynamicChildren(),
                    ),
                ],
            ),
        ];
    }) as ParentElement;
    return [refManager.getPublicAPI() as ParentElementRefs, render]
}
