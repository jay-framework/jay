import {
    ComponentCollectionProxy,
    Coordinate,
    createJayContext,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    JayComponent
} from "jay-runtime";
import {IJayEndpoint, IJayPort} from "../comm-channel/comm-channel";
import {Reactive} from "jay-reactive";


export interface SandboxContext {
    port: IJayPort,
    compId: number,
    coordinate: Coordinate
}
export const SANDBOX_BRIDGE_CONTEXT = createJayContext<SandboxContext>()
export type Refs = Record<string, HTMLElementCollectionProxy<any, any> | HTMLElementProxy<any, any> |
    JayComponent<any, any, any> | ComponentCollectionProxy<any, JayComponent<any, any, any>>>

export interface SandboxCreationContext<ViewState> {
    viewState: ViewState,
    endpoint: IJayEndpoint,
    refs?: Refs,
    dataIds: string[],
    isDynamic: boolean,
    parentComponentReactive?: Reactive
}

export const SANDBOX_CREATION_CONTEXT = createJayContext<SandboxCreationContext<any>>()