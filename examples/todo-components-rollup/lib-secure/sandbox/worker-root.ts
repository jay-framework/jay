import { TodoComponent, TodoProps } from './todo';
import {
    compRef,
    HandshakeMessageJayChannel,
    JayPort,
    sandboxRoot,
    setWorkerPort,
} from 'jay-secure';
import { sandboxChildComp } from 'jay-secure';

export function initializeWorker() {
    sandboxRoot(() => [sandboxChildComp(TodoComponent, (vs) => vs.todos, compRef('a'))]);
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
