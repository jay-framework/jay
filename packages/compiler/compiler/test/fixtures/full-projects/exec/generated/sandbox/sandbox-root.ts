import {
    SecureReferencesManager,
    sandboxRoot,
    sandboxChildComp as childComp,
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { AutoCounter } from './auto-counter?jay-workerSandbox';

export interface AppViewState {
    incrementBy: number;
}

export function initializeWorker() {
    sandboxRoot(() => {
        const [refManager, [refA]] = SecureReferencesManager.forSandboxRoot([], [], ['a'], []);
        return [childComp(AutoCounter, (vs: AppViewState) => ({ initialValue: 12 }), refA())];
    });
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
