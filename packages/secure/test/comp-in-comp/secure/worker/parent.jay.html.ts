import { JayElement, HTMLElementProxy } from 'jay-runtime';
import { compCollectionRef, compRef, elementBridge, elemRef } from '../../../../lib';
import {
    sandboxElement as e,
    sandboxChildComp as childComp,
    sandboxForEach as forEach,
} from '../../../../lib/';
import { ChildRef } from '../../regular/child-refs';
import { Child, ChildProps } from './child';
import { ChildRefs } from '../main/child-refs';

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

export function render(viewState: ParentViewState): ParentElement {
    return elementBridge(viewState, () => {
        const refDynamicChildren = compCollectionRef('dynamicChildren');
        return [
            e(elemRef('parentChangesChildPropButton')),
            e(elemRef('parentCallsChildApiButton')),
            childComp(
                Child,
                (vs) => ({ textFromParent: vs.childText, id: 'static' }),
                compRef('staticChild'),
            ),
            forEach(
                (vs) => vs.dynamicChildren,
                'id',
                () => [
                    childComp(
                        Child,
                        (vs: DynamicChild) => ({ textFromParent: vs.childText, id: vs.id }),
                        refDynamicChildren(),
                    ),
                ],
            ),
        ];
    });
}
