import { JayComponent, currentContext } from "jay-runtime";
import {render, TreeNodeElement, TreeNodeViewState} from "./tree-node.jay.html";
import {getViewState} from "../../../lib/view-state-model";
import { Props } from "jay-component";

export interface Node {
    id: string,
    name: string,
    children: Array<Node>
}

function makeComponentBridge(compRender: () => TreeNodeViewState): JayComponent<Node, TreeNodeViewState, TreeNodeElement> {
    let context = currentContext();

    let element: TreeNodeElement = render(compRender());
    return {
        element,
        update: (newData: Node) => element.update(compRender()),
        mount: () => element.mount(),
        unmount: () => element.unmount(),
        addEventListener: (eventType: string, handler: Function) => {},
        removeEventListener: (eventType: string) => {}
    }
}

// todo how do we move the childCompId to the component, and how to use it with getViewState(childCompId)
export function TreeNode(props: Node): JayComponent<Node, TreeNodeViewState, TreeNodeElement> {
    const jayComponent = makeComponentBridge(() => getViewState() as TreeNodeViewState);
    return jayComponent;
}
