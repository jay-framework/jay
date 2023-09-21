import { mkBridgeElement } from './sandbox-refs';
import { SandboxElement } from './sandbox-element';
import { JayElement, useContext } from 'jay-runtime';
import { SANDBOX_BRIDGE_CONTEXT } from './sandbox-context';
import { COMPONENT_CONTEXT } from 'jay-component';
import { Reactive } from 'jay-reactive';
import { ArrayContexts } from 'jay-serialization/dist/serialize/diff';

export function elementBridge<ElementViewState, ElementRef>(
    viewState: ElementViewState,
    sandboxElements: () => SandboxElement<ElementViewState>[],
    arraySerializationContext: ArrayContexts = [],
): JayElement<ElementViewState, ElementRef> {
    let parentComponentContext = useContext(SANDBOX_BRIDGE_CONTEXT);
    let { reactive, getComponentInstance } = useContext(COMPONENT_CONTEXT);
    let thisComponentEndpoint = parentComponentContext.port.getEndpoint(
        parentComponentContext.compId,
        parentComponentContext.coordinate,
    );
    // for some reason typescript insists that the types Reactive !== Reactive...
    return mkBridgeElement(
        viewState,
        sandboxElements,
        thisComponentEndpoint,
        reactive as unknown as Reactive,
        getComponentInstance,
        arraySerializationContext,
    ) as unknown as JayElement<ElementViewState, ElementRef>;
}
