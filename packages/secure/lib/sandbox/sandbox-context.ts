import {Coordinate, createJayContext, HTMLElementCollectionProxy, HTMLElementProxy} from "jay-runtime";
import {JayEndpoint, JayPort} from "../comm-channel";


export interface SandboxContext {
    port: JayPort
    endpoint: JayEndpoint
    compId: number,
    coordinate: Coordinate
}
export const SANDBOX_MARKER = createJayContext<SandboxContext>()
export type Refs = Record<string, HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any>>

interface SandboxCreationContext<ViewState> {
    viewState: ViewState,
    endpoint: JayEndpoint,
    refs: Refs,
    dataIds: string[]
}

export const SANDBOX_CREATION_CONTEXT = createJayContext<SandboxCreationContext<any>>()