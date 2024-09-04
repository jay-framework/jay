import { Main } from './main';
import {
    HandshakeMessageJayChannel,
    JayPort,
    sandboxRoot,
    SecureReferencesManager,
    setWorkerPort,
} from 'jay-secure';
import { sandboxChildComp } from 'jay-secure';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [refA]] = SecureReferencesManager.forSandboxRoot([], [], ['a'], []);
        return [sandboxChildComp(Main, (vs) => ({}), refA())];
    });
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
