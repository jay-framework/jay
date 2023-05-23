import {Coordinate} from "jay-runtime";
import {
    JPMAddEventListener,
    JPMDomEvent,
    JPMNativeExec,
    JPMNativeExecResult, JPMRemoveEventListener,
    JPMRender, JPMRootAPIInvoke, JPMRootAPIReturns,
    JPMRootComponentViewState
} from "./messages";


export type JPMMessage = JPMRootComponentViewState | JPMRender | JPMAddEventListener | JPMDomEvent | JPMNativeExecResult |
                         JPMNativeExec | JPMRootAPIInvoke | JPMRootAPIReturns | JPMRemoveEventListener

export type JayPortInMessageHandler = (inMessage: JPMMessage) => void;

export interface JayChannel {
    mainPort: JayPort,
    workerPort: JayPort
}

export interface JayPort {
    getRootEndpoint(): JayEndpoint;
    getEndpoint(parentCompId: number, parentCoordinate: Coordinate): JayEndpoint;
    batch<T>(handler: () => T): T
    flush()
}

export interface JayEndpoint {
    port: JayPort
    post(outMessage: JPMMessage);
    onUpdate(handler: JayPortInMessageHandler);
    readonly compId: number;
}

let _channel: JayChannel
export function setChannel(channel: JayChannel) {
    _channel = channel;
}
export function useMainPort(): JayPort {
    return _channel.mainPort
}
export function useWorkerPort(): JayPort {
    return _channel.workerPort
}