import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicElement as de,
    forEach,
    ConstructContext,
    HTMLElementProxy,
    childComp,
    elemRef as er,
    compRef as cr,
    compCollectionRef as ccr,
    RenderElementOptions,
} from 'jay-runtime';
import { ChildRef, ChildRefs } from './child-refs';
import { Child, ChildProps } from './child';
import { secureChildComp } from '../../../../lib/';

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
    staticChild: ChildRef<ParentViewState>;
    dynamicChildren: ChildRefs<DynamicChild>;
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>;

export function render(viewState: ParentViewState, options?: RenderElementOptions): ParentElement {
    return ConstructContext.withRootContext(
        viewState,
        () => {
            const refDynamicChildren = ccr('dynamicChildren');
            const parentChangesChildPropButton = er('parentChangesChildPropButton');
            const parentCallsChildApiButton = er('parentCallsChildApiButton');
            const staticChild = cr('staticChild');
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
                    ['parent changes child prop'],
                    parentChangesChildPropButton(),
                ),
                e(
                    'button',
                    { id: 'parent-calls-child-api-button' },
                    ['parent calls child api'],
                    parentCallsChildApiButton(),
                ),
                secureChildComp(
                    Child,
                    (vs) => ({ textFromParent: vs.childText, id: 'static' }),
                    staticChild(),
                ),
                forEach(
                    (vs: ParentViewState) => vs.dynamicChildren,
                    (vs1: DynamicChild) => {
                        return e('div', {}, [
                            secureChildComp(
                                Child,
                                (vs: DynamicChild) => ({ textFromParent: vs.childText, id: vs.id }),
                                refDynamicChildren(),
                            ),
                        ]);
                    },
                    'id',
                ),
            ]);
        },
        options,
    );
}
