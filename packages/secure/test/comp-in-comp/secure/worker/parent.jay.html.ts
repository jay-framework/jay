import {JayElement, HTMLElementProxy} from "jay-runtime";
import {elementBridge} from "../../../../lib";
import {sandboxElement as e, sandboxChildComp as childComp} from "../../../../lib/";
import {ChildRef} from "../../regular/child-refs";
import {Child} from "./child";

export interface ParentViewState {
    textFromChildEvent: string,
    viewStateFromChildEvent: string,
    coordinateFromChildEvent: string,
    childText: string
}

export interface ParentElementRefs {
    parentChangesChildPropButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
    parentCallsChildApiButton: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
    child: ChildRef<ParentViewState>
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>

export function render(viewState: ParentViewState): ParentElement {
    return elementBridge(viewState, () => [
        e('parentChangesChildPropButton'),
        e('parentCallsChildApiButton'),
        childComp(Child, vs => ({textFromParent: 'childText'}), 'child')
    ]);
}