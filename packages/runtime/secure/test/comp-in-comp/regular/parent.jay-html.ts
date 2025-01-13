import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    childComp,
    RenderElementOptions,
    RenderElement,
    ReferencesManager,
    MapEventEmitterViewState,
    ComponentCollectionProxy,
    OnlyEventEmitters,
} from 'jay-runtime';
import { Child, ChildProps } from './child';

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

export type ChildRef<ParentVS> = MapEventEmitterViewState<ParentVS, ReturnType<typeof Child>>;
export type ChildRefs<ParentVS> = ComponentCollectionProxy<ParentVS, ChildRef<ParentVS>> &
    OnlyEventEmitters<ChildRef<ParentVS>>;
export interface ParentElementRefs {
    parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>;
    staticChild: ChildRef<ParentViewState>;
    dynamicChildren: ChildRefs<DynamicChild>;
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>;
export type ParentElementRender = RenderElement<ParentViewState, ParentElementRefs, ParentElement>;
export type ParentElementPreRender = [ParentElementRefs, ParentElementRender];

export function render(options?: RenderElementOptions): ParentElementPreRender {
    const [
        refManager,
        [parentChangesChildPropButton, parentCallsChildApiButton, staticChild, dynamicChildren],
    ] = ReferencesManager.for(
        options,
        ['parentChangesChildPropButton', 'parentCallsChildApiButton'],
        [],
        ['staticChild'],
        ['dynamicChildren'],
    );
    const render = (viewState: ParentViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () => {
            return de('div', {}, [
                e('div', { id: 'text-from-child-event' }, [dt((vs) => vs.textFromChildEvent)]),
                e('div', { id: 'view-state-from-child-event' }, [
                    dt((vs) => vs.viewStateFromChildEvent),
                ]),
                e('div', { id: 'coordinate-from-child-event' }, [
                    dt((vs) => vs.coordinateFromChildEvent),
                ]),
                e(
                    'button',
                    { id: 'parent-changes-child-prop-button' },
                    [' parent changes child prop '],
                    parentChangesChildPropButton(),
                ),
                e(
                    'button',
                    { id: 'parent-calls-child-api-button' },
                    [' parent calls child api '],
                    parentCallsChildApiButton(),
                ),
                childComp(
                    Child,
                    (vs: ParentViewState) => ({ textFromParent: vs.childText, id: 'static' }),
                    staticChild(),
                ),
                forEach(
                    (vs) => vs.dynamicChildren,
                    (vs1: DynamicChild) => {
                        return e('div', {}, [
                            childComp(
                                Child,
                                (vs: DynamicChild) => ({ textFromParent: vs.childText, id: vs.id }),
                                dynamicChildren(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]);
        }) as ParentElement;
    return [refManager.getPublicAPI() as ParentElementRefs, render];
}
