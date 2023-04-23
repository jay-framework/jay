import {
    ComponentCollectionProxy,
    Coordinate,
    createJayContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    JayComponent
} from "jay-runtime";
import {JayEndpoint, JayPort} from "../comm-channel";


export interface SandboxContext {
    port: JayPort,
    compId: number,
    coordinate: Coordinate
}
export const SANDBOX_MARKER = createJayContext<SandboxContext>()
export type Refs = Record<string, HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> |
    JayComponent<any, any, any> | ComponentCollectionProxy<any, JayComponent<any, any, any>>>

interface SandboxCreationContext<ViewState> {
    viewState: ViewState,
    endpoint: JayEndpoint,
    refs: Refs,
    dataIds: string[],
    isDynamic: boolean
}

export const SANDBOX_CREATION_CONTEXT = createJayContext<SandboxCreationContext<any>>()