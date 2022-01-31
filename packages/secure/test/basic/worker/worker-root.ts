import {Basic, BasicProps} from "./basic";
import {getViewState} from "./view-state-model";
import {WorkerPort} from "../../../lib/comm-channel";

class WorkerRoot<AppProps> {
    port: WorkerPort<AppProps>
    workerRoot: ReturnType<typeof Basic>;
    constructor(port: WorkerPort<AppProps>) {
        this.port = port;
        port.onInit = this.init;
        port.onUpdate = this.update;
    }

    init(initialProps: AppProps): object {
        this.workerRoot = Basic(initialProps as unknown as BasicProps);
        return getViewState();
    }

    update(props: AppProps): object {
        this.workerRoot.update(props as unknown as BasicProps);
        return getViewState();
    }
}

export function initializeWorker(port: WorkerPort<BasicProps>) {
    return new WorkerRoot(port);
}
