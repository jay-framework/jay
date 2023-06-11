import {Coordinate} from "jay-runtime";

export enum JayPortMessageType {
    render = 0,
    addEventListener = 1,
    root = 2,
    eventInvocation = 3,
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
    viewState: string
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
    readonly type: JayPortMessageType.eventInvocation
    eventType: string
    coordinate: Coordinate
    eventData: any
}
export interface JPMRootComponentViewState extends JayPortMessage {
    readonly type: JayPortMessageType.root
    viewState: string
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

export function rootApiReturns(callId: number, returns: any, error?: any): JPMRootAPIReturns {
    return ({callId, returns, error, type: JayPortMessageType.rootApiReturns})
}

export function renderMessage(viewState: string): JPMRender {
    return ({viewState, type: JayPortMessageType.render});
}

export function addEventListenerMessage(refName: string, eventType: string, nativeId?: string): JPMAddEventListener {
    return ({refName, eventType, nativeId, type: JayPortMessageType.addEventListener});
}

export function removeEventListenerMessage(refName: string, eventType: string): JPMRemoveEventListener {
    return ({refName, eventType, type: JayPortMessageType.removeEventListener});
}

export function eventInvocationMessage(eventType: string, coordinate: Coordinate, eventData?: any): JPMDomEvent {
    return ({coordinate, eventType, eventData, type: JayPortMessageType.eventInvocation});
}

export function rootComponentViewState(viewState: string): JPMRootComponentViewState {
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