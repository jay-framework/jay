import {Coordinate} from "jay-runtime";

export enum JayPortMessageType {
    render = 0,
    addEventListener = 1,
    root = 2,
    DOMEvent = 3,
    removeEventListener,
    nativeExec,
    nativeExecResult,
    rootApiInvoke,
    rootApiReturns
}
export interface JayPortMessage {
    readonly type: JayPortMessageType;
}
export interface JPMRender extends JayPortMessage {
    readonly type: JayPortMessageType.render
    viewState: any
}
export interface JPMAddEventListener extends JayPortMessage {
    readonly type: JayPortMessageType.addEventListener
    eventType: string
    refName: string
    nativeId?: string
}
export interface JPMNativeExec extends JayPortMessage {
    readonly type: JayPortMessageType.nativeExec
    refName: string
    nativeId?: string
    correlationId: number,
    coordinate: Coordinate
}
export interface JPMNativeExecResult extends JayPortMessage {
    readonly type: JayPortMessageType.nativeExecResult
    refName: string
    correlationId: number
    result: any
    error: any
}
export interface JPMRemoveEventListener extends JayPortMessage {
    readonly type: JayPortMessageType.removeEventListener
    eventType: string
    refName: string
}
export interface JPMDomEvent extends JayPortMessage {
    readonly type: JayPortMessageType.DOMEvent
    eventType: string
    coordinate: Coordinate
    eventData: any
}
export interface JPMRootComponentViewState extends JayPortMessage {
    readonly type: JayPortMessageType.root
    viewState: object
}

export interface JPMRootAPIInvoke extends JayPortMessage {
    readonly type: JayPortMessageType.rootApiInvoke
    apiName: string,
    callId: number,
    params: Array<any>
}

export interface JPMRootAPIReturns extends JayPortMessage {
    readonly type: JayPortMessageType.rootApiReturns
    callId: number,
    returns: any,
    error?: any
}

export type JPMMessage = JPMRootComponentViewState | JPMRender | JPMAddEventListener | JPMDomEvent | JPMNativeExecResult |
                         JPMNativeExec | JPMRootAPIInvoke | JPMRootAPIReturns

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
    post(outMessage: JayPortMessage);
    onUpdate(handler: JayPortInMessageHandler);
    readonly compId: number;
}

export function renderMessage(viewState): JPMRender {
    return ({viewState, type: JayPortMessageType.render});
}
export function addEventListenerMessage(refName: string, eventType: string, nativeId?: string): JPMAddEventListener {
    return ({refName, eventType, nativeId, type: JayPortMessageType.addEventListener});
}
export function removeEventListenerMessage(refName: string, eventType: string): JPMRemoveEventListener {
    return ({refName, eventType, type: JayPortMessageType.removeEventListener});
}
export function domEventMessage(eventType: string, coordinate: Coordinate, eventData?: any): JPMDomEvent {
    return ({coordinate, eventType, eventData, type: JayPortMessageType.DOMEvent});
}
export function rootComponentViewState(viewState: any): JPMRootComponentViewState {
    return ({viewState, type: JayPortMessageType.root});
}
export function nativeExec(refName: string, nativeId: string, correlationId: number, coordinate: Coordinate): JPMNativeExec {
    return ({refName, nativeId, correlationId, coordinate, type: JayPortMessageType.nativeExec})
}
export function nativeExecResult(refName: string, correlationId: number, result: any, error?: any): JPMNativeExecResult {
    return ({refName, result, correlationId, error, type: JayPortMessageType.nativeExecResult})
}
export function rootApiInvoke(apiName: string, callId: number, params: Array<any>): JPMRootAPIInvoke {
    return ({apiName, callId, params, type: JayPortMessageType.rootApiInvoke})
}
export function rootApiReturns(callId: number, returns: any, error?: any): JPMRootAPIReturns {
    return ({callId, returns, error, type: JayPortMessageType.rootApiReturns})
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