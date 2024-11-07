import {
    SecureReferencesManager,
    sandboxRoot,
    sandboxChildComp as childComp,
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from 'jay-secure';
import { AutoCounter } from './auto-counter?jay-workerSandbox';

export interface AppViewState {
    incrementBy: number;
}

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [refA]] = SecureReferencesManager.forSandboxRoot([], [], ['a'], []);
        return [childComp(AutoCounter, (vs: AppViewState) => ({ initialValue: 12 }), refA())];
    });
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
