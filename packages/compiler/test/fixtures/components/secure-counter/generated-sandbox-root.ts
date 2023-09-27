import {sandboxRoot, sandboxChildComp as childComp, compRef as cr, HandshakeMessageJayChannel, JayPort, setWorkerPort} from "jay-secure";
import {Counter} from "./counter";

export interface AppViewState {}

export function initializeWorker() {
  sandboxRoot(() => [
    childComp(Counter, (vs: AppViewState) => ({initialValue: 12}), cr('a'))
  ]);
}

setWorkerPort(new JayPort(new HandshakeMessageJayChannel(self)));
initializeWorker();
