import {Counter, CounterProps} from "./counter";
import {HandshakeMessageJayChannel, JayPort, sandboxRoot, setWorkerPort} from "jay-secure";
import {sandboxChildComp} from "jay-secure";

export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, CounterProps>(Counter, vs => ({initialValue: 12}), 'a')
    ])
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)))
initializeWorker();