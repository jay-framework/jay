import { Counter } from './counter';
import {
    compRef,
    HandshakeMessageJayChannel,
    JayPort,
    sandboxRoot,
    setWorkerPort,
} from 'jay-secure';
import { sandboxChildComp } from 'jay-secure';

export function initializeWorker() {
    sandboxRoot(() => [sandboxChildComp(Counter, (vs) => ({ initialValue: 12 }), compRef('a'))]);
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
