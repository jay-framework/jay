import {createJayContext} from "jay-runtime";
import {JayEndpoint, JayPort} from "../comm-channel/comm-channel";
import {FunctionsRepository} from "./function-repository-types";

export interface SecureComponentContext {
    compId: number,
    endpoint: JayEndpoint,
    port: JayPort
    funcRepository?: FunctionsRepository
}
export const SECURE_COMPONENT_MARKER = createJayContext<SecureComponentContext>()