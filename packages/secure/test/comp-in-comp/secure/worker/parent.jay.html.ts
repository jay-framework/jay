import {JayElement, HTMLElementProxy} from "jay-runtime";
import {elementBridge} from "../../../../lib";
import {sandboxElement as e, sandboxChildComp as childComp} from "../../../../lib/";
import {ChildRef} from "../../regular/child-refs";
import {Child} from "./child";

export interface ParentViewState {
    text: string,
    childText: string
}

export interface ParentElementRefs {
    button: HTMLElementProxy<ParentViewState, HTMLButtonElement>,
    child: ChildRef<ParentViewState>
}

export type ParentElement = JayElement<ParentViewState, ParentElementRefs>

export function render(viewState: ParentViewState): ParentElement {
    return elementBridge(viewState, () => [
        e('button'),
        childComp(Child, vs => ({textFromParent: 'childText'}), 'child')
    ]);
}