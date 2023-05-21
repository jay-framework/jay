import {mkBridgeElement} from "./sandbox-refs";
import {SandboxElement} from "./sandbox-element";

export function elementBridge<ElementViewState>(viewState: ElementViewState,
                                                sandboxElements: () => SandboxElement<ElementViewState>[],
                                                dynamicElements: string[] = [],
                                                dynamicComponents: string[] = []) {
    // for some reason typescript insists that the types Reactive !== Reactive...
    return mkBridgeElement(viewState, sandboxElements, dynamicElements, dynamicComponents);
}