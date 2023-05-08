import {useContext} from "jay-runtime";
import {SANDBOX_BRIDGE_CONTEXT} from "./sandbox-context";
import {mkBridgeElement} from "./sandbox-refs";
import {COMPONENT_CONTEXT} from "jay-component";
import {Reactive} from "jay-reactive";
import {SandboxElement} from "./sandbox-element";

export function elementBridge<ElementViewState>(viewState: ElementViewState, sandboxElements: () => SandboxElement<ElementViewState>[],
                                                dynamicElements: string[] = [], dynamicComponents: string[] = []) {
    let parentContext = useContext(SANDBOX_BRIDGE_CONTEXT);
    let {reactive} = useContext(COMPONENT_CONTEXT);
    let ep = parentContext.port.getEndpoint(parentContext.compId, parentContext.coordinate)
    // for some reason typescript insists that the types Reactive !== Reactive...
    return mkBridgeElement(viewState, ep, reactive as unknown as Reactive, sandboxElements, dynamicElements, dynamicComponents);
}