import { BaseJayElement, MatchResult } from "jay-runtime"


export type JayPortInMessageHandler = (inMessage: any) => void;
export interface JayPort {
    post(compId: string, outMessage: any);
    onUpdate(handler: JayPortInMessageHandler)
    batch(handler: () => void)
    flush()
}

export const ROOT_MESSAGE = '.';
export type TID = number
export type IIDPath = string
export enum RenderingElements {
    ForEach,
    SubComp
}
export interface CollectionRendering<Item> {
    type: RenderingElements.ForEach
    path: IIDPath
    instructions: Array<MatchResult<Item, BaseJayElement<Item>>>
}

export interface SubCompRendering {
    type: RenderingElements.SubComp
    path: IIDPath
}
export interface RenderMessage {
    components: Map<TID, CollectionRendering<any> | SubCompRendering>
}

let _port
export function setPort(port: JayPort) {
    _port = port;
}
export function usePort(): JayPort {
    return _port
}