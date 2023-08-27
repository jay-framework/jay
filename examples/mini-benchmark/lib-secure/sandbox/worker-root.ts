import {Main} from "./main";
import {compRef, HandshakeMessageJayChannel, JayPort, sandboxRoot, setWorkerPort} from "jay-secure";
import {sandboxChildComp} from "jay-secure";



export function initializeWorker() {
    sandboxRoot(() => [
        sandboxChildComp(Main, vs => ({}), compRef('a'))
    ])
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)))
initializeWorker();