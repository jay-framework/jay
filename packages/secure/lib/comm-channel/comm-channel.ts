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
    mainPort: IJayPort,
    workerPort: IJayPort
}

export interface IJayPort {
    getRootEndpoint(): IJayEndpoint;
    getEndpoint(parentCompId: number, parentCoordinate: Coordinate): IJayEndpoint;
    batch<T>(handler: () => T): T
    flush()
}

export interface IJayEndpoint {
    port: IJayPort
    post(outMessage: JPMMessage);
    onUpdate(handler: JayPortInMessageHandler);
    readonly compId: number;
}

let _channel: JayChannel
export function setChannel(channel: JayChannel) {
    _channel = channel;
}
export function useMainPort(): IJayPort {
    return _channel.mainPort
}
export function useWorkerPort(): IJayPort {
    return _channel.workerPort
}