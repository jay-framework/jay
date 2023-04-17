import {TreeNode, Node} from "./tree-node";
import {getViewState} from "../../../lib/view-state-model";
import {WorkerPort} from "../../../../lib/comm-channel";

class WorkerRoot<AppProps> {
    port: WorkerPort<AppProps>
    workerRoot: ReturnType<typeof TreeNode>;
    constructor(port: WorkerPort<AppProps>) {
        this.port = port;
        port.onInit = this.init;
        port.onUpdate = this.update;
    }

    init(initialProps: AppProps): object {
        this.workerRoot = TreeNode(initialProps as unknown as Node);
        return getViewState();
    }

    update(props: AppProps): object {
        this.workerRoot.update(props as unknown as Node);
        return getViewState();
    }
}

export function initializeWorker(port: WorkerPort<Node>) {
    return new WorkerRoot(port);
}
