export enum JayPortMessageType {
    render = 0,
    addEventListener = 1,
    root = 2,
    DOMEvent = 3,
    removeEventListener,
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
}
export interface JPMRemoveEventListener extends JayPortMessage {
    readonly type: JayPortMessageType.removeEventListener
    eventType: string
    refName: string
}
export interface JPMDomEvent extends JayPortMessage {
    readonly type: JayPortMessageType.DOMEvent
    eventType: string
    coordinate: string
    eventData: any
}
export interface JPMRootComponentViewState extends JayPortMessage {
    readonly type: JayPortMessageType.root
    viewState: object
}

export type JPMMessage = JPMRootComponentViewState | JPMRender | JPMAddEventListener | JPMDomEvent

export const ROOT_MESSAGE = 0;

export type JayPortInMessageHandler = (inMessage: JPMMessage) => void;

export interface JayChannel {
    mainPort: JayPort,
    workerPort: JayPort
}

export interface JayPort {
    getRootEndpoint(): JayEndpoint;
    getEndpoint(parentCompId: number, parentCoordinate: string): JayEndpoint;
    batch<T>(handler: () => T): T
    flush()
}

export interface JayEndpoint {
    post(outMessage: JayPortMessage);
    onUpdate(handler: JayPortInMessageHandler);
    readonly compId: number;
}

export function renderMessage(viewState): JPMRender {
    return ({viewState, type: JayPortMessageType.render});
}
export function addEventListenerMessage(refName: string, eventType: string): JPMAddEventListener {
    return ({refName, eventType, type: JayPortMessageType.addEventListener});
}
export function removeEventListenerMessage(refName: string, eventType: string): JPMRemoveEventListener {
    return ({refName, eventType, type: JayPortMessageType.removeEventListener});
}
export function domEventMessage(eventType: string, coordinate: string, eventData?: any): JPMDomEvent {
    return ({coordinate, eventType, eventData, type: JayPortMessageType.DOMEvent});
}
export function rootComponentViewState(viewState: any): JPMRootComponentViewState {
    return ({viewState, type: JayPortMessageType.root});
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