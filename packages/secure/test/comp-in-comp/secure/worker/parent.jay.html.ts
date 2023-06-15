import {JayElement, HTMLElementProxy} from "jay-runtime";
import {elementBridge} from "../../../../lib";
import {sandboxElement as e, sandboxChildComp as childComp, sandboxForEach as forEach} from "../../../../lib/";
import {ChildRef} from "../../regular/child-refs";
import {Child, ChildProps} from "./child";
import {ChildRefs} from "../main/child-refs";

export interface DynamicChild {
    id: string,
    childText: string
}

export interface ParentViewState {
    textFromChildEvent: string,
    viewStateFromChildEvent: string,
    coordinateFromChildEvent: string,
    childText: string,
    dynamicChildren: Array<DynamicChild>
}

export interface ParentElementRefs {
    parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
    parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
    staticChild: ChildRef<ParentViewState>,
    dynamicChildren: ChildRefs<DynamicChild>
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>

export function render(viewState: ParentViewState): ParentElement {
    return elementBridge(viewState, () => [
        e('parentChangesChildPropButton'),
        e('parentCallsChildApiButton'),
        childComp(Child, vs => ({textFromParent: vs.childText, id: 'static'}), 'staticChild'),
        forEach(vs => vs.dynamicChildren, 'id', () => [
            childComp<DynamicChild, ChildProps>(Child, vs => ({textFromParent: vs.childText, id: vs.id}), 'dynamicChildren'),
        ])
    ], [], ['dynamicChildren']);
}