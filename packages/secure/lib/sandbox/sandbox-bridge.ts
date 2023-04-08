import {renderMessage} from "../comm-channel";
import {useContext} from "jay-runtime";
import {SANDBOX_MARKER} from "./sandbox-context";
import {mkBridgeElement, SandboxElement} from "./sandbox-refs";
import {COMPONENT_CONTEXT} from "jay-component";

export function elementBridge<ElementViewState>(viewState: ElementViewState, sandboxElements: () => SandboxElement<ElementViewState>[],
                                                dynamicRefs: string[] = []) {
    let parentContext = useContext(SANDBOX_MARKER);
    let {reactive} = useContext(COMPONENT_CONTEXT);
    let ep = parentContext.port.getEndpoint(parentContext.compId, parentContext.coordinate)
    ep.post(renderMessage(viewState));
    return mkBridgeElement(viewState, ep, reactive, sandboxElements, dynamicRefs);
}