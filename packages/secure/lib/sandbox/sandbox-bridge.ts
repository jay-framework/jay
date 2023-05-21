import {mkBridgeElement} from "./sandbox-refs";
import {SandboxElement} from "./sandbox-element";
import {useContext} from "jay-runtime";
import {SANDBOX_BRIDGE_CONTEXT} from "./sandbox-context";
import {COMPONENT_CONTEXT} from "jay-component";
import {Reactive} from "jay-reactive";

export function elementBridge<ElementViewState>(viewState: ElementViewState,
                                                sandboxElements: () => SandboxElement<ElementViewState>[],
                                                dynamicElements: string[] = [],
                                                dynamicComponents: string[] = []) {
    let parentComponentContext = useContext(SANDBOX_BRIDGE_CONTEXT);
    let {reactive, getComponentInstance} = useContext(COMPONENT_CONTEXT);
    let thisComponentEndpoint = parentComponentContext.port.getEndpoint(parentComponentContext.compId, parentComponentContext.coordinate)
    // for some reason typescript insists that the types Reactive !== Reactive...
    return mkBridgeElement(viewState, sandboxElements, dynamicElements, dynamicComponents, thisComponentEndpoint,
        reactive as unknown as Reactive, getComponentInstance);
}