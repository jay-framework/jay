import { TodoComponent, TodoProps } from './todo';
import {
    HandshakeMessageJayChannel,
    JayPort,
    sandboxRoot,
    SecureReferencesManager,
    setWorkerPort,
} from '@jay-framework/secure';
import { sandboxChildComp } from '@jay-framework/secure';

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [refA]] = SecureReferencesManager.forSandboxRoot([], [], ['a'], []);
        return [sandboxChildComp(TodoComponent, (vs) => vs.todos, refA())];
    });
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
