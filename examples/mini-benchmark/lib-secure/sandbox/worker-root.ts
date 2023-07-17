
import {Main, MainProps} from "./main";
import {HandshakeMessageJayChannel, JayPort, sandboxRoot, setWorkerPort} from "jay-secure";
import {sandboxChildComp} from "jay-secure";



export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp<any, MainProps>(Main, vs => ({}), 'a')
    ])
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)))
initializeWorker();