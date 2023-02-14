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
export interface JPMRoot extends JayPortMessage {
    readonly type: JayPortMessageType.root
    props: any
}

export type JPMMessage = JPMRoot | JPMRender | JPMAddEventListener | JPMDomEvent

export const ROOT_MESSAGE = '.';

export type JayPortInMessageHandler = (inMessage: JayPortMessage) => void;
export interface JayPort {
    post(compId: string, outMessage: JayPortMessage);
    onUpdate(handler: JayPortInMessageHandler)
    batch(handler: () => void)
    flush()
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
export function rootMessage(props: any): JPMRoot {
    return ({props, type: JayPortMessageType.root});
}

let _port
export function setPort(port: JayPort) {
    _port = port;
}
export function usePort(): JayPort {
    return _port
}