import {
    sandboxRoot,
    sandboxChildComp as childComp,
    compRef as cr,
    HandshakeMessageJayChannel,
    JayPort,
    setWorkerPort,
} from 'jay-secure';
import { Counter } from './counter?jay-sandboxWorker';

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
