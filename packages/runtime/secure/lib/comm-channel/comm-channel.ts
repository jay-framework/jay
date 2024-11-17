import { Coordinate } from 'jay-runtime';
import {
    JPMAddEventListener,
    JPMDomEvent,
    JPMNativeExec,
    JPMNativeExecResult,
    JPMRemoveEventListener,
    JPMRender,
    JPMRootAPIInvoke,
    JPMRootAPIReturns,
    JPMRootComponentViewState,
} from './messages';

export type JPMMessage =
    | JPMRootComponentViewState
    | JPMRender
    | JPMAddEventListener
    | JPMDomEvent
    | JPMNativeExecResult
    | JPMNativeExec
    | JPMRootAPIInvoke
    | JPMRootAPIReturns
    | JPMRemoveEventListener;

export type JayPortInMessageHandler = (inMessage: JPMMessage) => void;

export interface JayChannel {
    postMessages(messages: Array<[number, JPMMessage]>, newCompIdMessages: Array<[string, number]>);
    onMessages(
        handler: (
            messages: Array<[number, JPMMessage]>,
            newCompIdMessages: Array<[string, number]>,
        ) => void,
    );
}

export interface IJayPort {
    getRootEndpoint(): IJayEndpoint;
    getEndpoint(parentCompId: number, parentCoordinate: Coordinate): IJayEndpoint;
    batch<T>(handler: () => T): T;
    flush();
}

export interface IJayEndpoint {
    port: IJayPort;
    post(outMessage: JPMMessage);
    onUpdate(handler: JayPortInMessageHandler);
    readonly compId: number;
}
let _mainPort: IJayPort;
export function setMainPort(port: IJayPort) {
    _mainPort = port;
}
export function useMainPort(): IJayPort {
    return _mainPort;
}
let _workerPort: IJayPort;
export function setWorkerPort(port: IJayPort) {
    _workerPort = port;
}
export function useWorkerPort(): IJayPort {
    return _workerPort;
}
