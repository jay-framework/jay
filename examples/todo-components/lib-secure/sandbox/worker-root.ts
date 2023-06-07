import {TodoComponent, TodoProps} from "./todo";
import {HandshakeMessageJayChannel, JayPort, sandboxRoot, setWorkerPort} from "jay-secure";
import {sandboxChildComp} from "jay-secure";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, TodoProps>(TodoComponent, vs => (vs.todos), 'a')
    ])
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)))
initializeWorker();