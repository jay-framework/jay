import {
    sandboxRoot,
    sandboxChildComp as childComp,
    compRef as cr,
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from 'jay-secure';
// @ts-expect-error Cannot find module
import { Counter } from './counter?jay-workerSandbox';

export interface AppViewState {
    incrementBy: number;
}

export function initializeWorker() {
    sandboxRoot(() => [
        childComp(
            Counter,
            (vs: AppViewState) => ({ initialValue: 12, incrementBy: vs.incrementBy }),
            cr('a'),
        ),
    ]);
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
