import { BaseJayElement, MatchResult } from "jay-runtime"



export interface MainPort<RootComponentProps> {
    init(initData: RootComponentProps): object
    update(data: RootComponentProps): object
}

export interface WorkerPort<RootComponentProps> {
    onInit: (initData: RootComponentProps) => object
    onUpdate: (data: RootComponentProps) => object
}

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