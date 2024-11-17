import {
    SecureReferencesManager,
    sandboxRoot,
    sandboxChildComp as childComp,
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from 'jay-secure';
// @ts-expect-error Cannot find module
import { TodoComponent, TodoProps } from './todo?jay-workerSandbox';

export interface AppViewState {
    todoProps: TodoProps;
}

export function initializeWorker() {
    sandboxRoot(() => {
        const [, [refAR1]] = SecureReferencesManager.forSandboxRoot([], [], ['aR1'], []);
        return [childComp(TodoComponent, (vs: AppViewState) => vs.todoProps, refAR1())];
    });
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
