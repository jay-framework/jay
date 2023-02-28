export enum JayPortMessageType {
    render = 0,
    addEventListener = 1,
    root = 2,
    DOMEvent = 3
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
    ref: string
}
export interface JPMDomEvent extends JayPortMessage {
    readonly type: JayPortMessageType.DOMEvent
    eventType: string
    coordinate: string
}
export interface JPMRootComponentProps extends JayPortMessage {
    readonly type: JayPortMessageType.root
    props: object
}

export type JPMMessage = JPMRootComponentProps | JPMRender | JPMAddEventListener | JPMDomEvent

export const ROOT_MESSAGE = 0;

export type JayPortInMessageHandler = (inMessage: JayPortMessage) => void;

export interface JayChannel {
    mainPort: JayPort,
    workerPort: JayPort
}

export interface JayPort {
    getEndpoint(parentCompId: number, coordinate: string): JayEndpoint;
    batch(handler: () => void)
    flush()

    getRootEndpoint(): JayEndpoint;
}

export interface JayEndpoint {
    post(outMessage: JayPortMessage);
    onUpdate(handler: JayPortInMessageHandler)
    get compId(): number;
}

export function renderMessage(viewState): JPMRender {
    return ({viewState, type: JayPortMessageType.render});
}
export function addEventListenerMessage(ref: string, eventType: string): JPMAddEventListener {
    return ({ref, eventType, type: JayPortMessageType.addEventListener});
}
export function domEventMessage(eventType: string, coordinate: string): JPMDomEvent {
    return ({coordinate, eventType, type: JayPortMessageType.DOMEvent});
}
export function rootComponentProps(props: any): JPMRootComponentProps {
    return ({props, type: JayPortMessageType.root});
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