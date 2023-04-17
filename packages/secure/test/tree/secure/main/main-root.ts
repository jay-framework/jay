import {JayPort} from "../../../../lib/comm-channel";
import {render, TreeNodeViewState, TreeNodeElement} from "./tree-node.jay.html";

export interface BasicProps {
    firstName: string,
    lastName: string
}

class MainRoot<AppProps> {
    private mainPort: JayPort<AppProps>
    element: TreeNodeElement;
    constructor(mainPort: JayPort<AppProps>) {
        this.mainPort = mainPort;
    }

    start(props: AppProps) {
        let viewState = this.mainPort.post(props);
        this.element = render(viewState as TreeNodeViewState)
    }

    update(props: AppProps) {
        let viewState = this.mainPort.update(props);
        this.element.update(viewState as TreeNodeViewState)
    }
}

export function initializeMain<BasicProps>(mainPort: JayPort<BasicProps>): MainRoot<BasicProps> {
    return new MainRoot(mainPort)

}