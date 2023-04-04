import {Coordinate, createJayContext} from "jay-runtime";
import {JayEndpoint, JayPort} from "../comm-channel";


export interface SandboxContext {
    port: JayPort
    endpoint: JayEndpoint
    compId: number,
    coordinate: Coordinate
}
export const SANDBOX_MARKER = createJayContext<SandboxContext>()