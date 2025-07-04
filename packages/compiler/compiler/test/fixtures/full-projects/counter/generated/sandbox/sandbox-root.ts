import {
    SecureReferencesManager,
    sandboxRoot,
    sandboxChildComp as childComp,
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from '@jay-framework/secure';
// @ts-expect-error Cannot find module
import { Counter } from './counter?jay-workerSandbox';

export interface AppViewState {
    incrementBy: number;
}

export function initializeWorker() {
    sandboxRoot(() => {
        const [refManager, [refA]] = SecureReferencesManager.forSandboxRoot([], [], ['a'], []);
        return [
            childComp(
                Counter,
                (vs: AppViewState) => ({ initialValue: 12, incrementBy: vs.incrementBy }),
                refA(),
            ),
        ];
    });
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
