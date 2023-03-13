import {createJayContext} from "jay-runtime";
import {JayEndpoint, JayPort} from "./comm-channel";

export interface SecureComponentContext {
    compId: number,
    endpoint: JayEndpoint,
    port: JayPort
}
export const SECURE_COMPONENT_MARKER = createJayContext<SecureComponentContext>()