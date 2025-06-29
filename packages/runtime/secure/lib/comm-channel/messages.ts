import { Coordinate } from '@jay-framework/runtime';
import { JSONPatch } from '@jay-framework/json-patch';

export enum JayPortMessageType {
    render = 0,
    addEventListener = 1,
    root = 2,
    eventInvocation = 3,
    removeEventListener,
    nativeExec,
    nativeExecResult,
    rootApiInvoke,
    rootApiReturns,
}
export interface JayPortMessage {
    readonly type: JayPortMessageType;
}
export interface JPMRender extends JayPortMessage {
    readonly type: JayPortMessageType.render;
    patch: JSONPatch;
}
export interface JPMAddEventListener extends JayPortMessage {
    readonly type: JayPortMessageType.addEventListener;
    eventType: string;
    refName: string;
    nativeId?: string;
}
export interface JPMNativeExec extends JayPortMessage {
    readonly type: JayPortMessageType.nativeExec;
    refName?: string;
    nativeId: string;
    correlationId: number;
    coordinate?: Coordinate;
}
export interface JPMNativeExecResult extends JayPortMessage {
    readonly type: JayPortMessageType.nativeExecResult;
    refName?: string;
    correlationId: number;
    result: any;
    error: any;
}
export interface JPMRemoveEventListener extends JayPortMessage {
    readonly type: JayPortMessageType.removeEventListener;
    eventType: string;
    refName: string;
}
export interface JPMDomEvent extends JayPortMessage {
    readonly type: JayPortMessageType.eventInvocation;
    eventType: string;
    coordinate: Coordinate;
    eventData: any;
}
export interface JPMRootComponentViewState extends JayPortMessage {
    readonly type: JayPortMessageType.root;
    patch: JSONPatch;
}

export interface JPMRootAPIInvoke extends JayPortMessage {
    readonly type: JayPortMessageType.rootApiInvoke;
    apiName: string;
    callId: number;
    params: Array<any>;
}

export interface JPMRootAPIReturns extends JayPortMessage {
    readonly type: JayPortMessageType.rootApiReturns;
    callId: number;
    returns: any;
    error?: any;
}

export function rootApiReturns(callId: number, returns: any, error?: any): JPMRootAPIReturns {
    return { callId, returns, error, type: JayPortMessageType.rootApiReturns };
}

export function renderMessage(patch: JSONPatch): JPMRender {
    return { patch, type: JayPortMessageType.render };
}

export function addEventListenerMessage(
    refName: string,
    eventType: string,
    nativeId?: string,
): JPMAddEventListener {
    return { refName, eventType, nativeId, type: JayPortMessageType.addEventListener };
}

export function removeEventListenerMessage(
    refName: string,
    eventType: string,
): JPMRemoveEventListener {
    return { refName, eventType, type: JayPortMessageType.removeEventListener };
}

export function eventInvocationMessage(
    eventType: string,
    coordinate: Coordinate,
    eventData?: any,
): JPMDomEvent {
    return { coordinate, eventType, eventData, type: JayPortMessageType.eventInvocation };
}

export function rootComponentViewState(patch: JSONPatch): JPMRootComponentViewState {
    return { patch, type: JayPortMessageType.root };
}

export function nativeExec(
    nativeId: string,
    correlationId: number,
    refName?: string,
    coordinate?: Coordinate,
): JPMNativeExec {
    return { refName, nativeId, correlationId, coordinate, type: JayPortMessageType.nativeExec };
}

export function nativeExecResult(
    correlationId: number,
    result: any,
    error?: any,
    refName?: string,
): JPMNativeExecResult {
    return { refName, result, correlationId, error, type: JayPortMessageType.nativeExecResult };
}

export function rootApiInvoke(
    apiName: string,
    callId: number,
    params: Array<any>,
): JPMRootAPIInvoke {
    return { apiName, callId, params, type: JayPortMessageType.rootApiInvoke };
}
