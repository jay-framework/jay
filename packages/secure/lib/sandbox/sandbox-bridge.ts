import {mkBridgeElement, SecureReferencesManager} from './sandbox-refs';
import { SandboxElement } from './sandbox-element';
import { JayElement, useContext } from 'jay-runtime';
import { SANDBOX_BRIDGE_CONTEXT } from './sandbox-context';
import { COMPONENT_CONTEXT } from 'jay-component';
import { Reactive } from 'jay-reactive';
import { ArrayContexts } from 'jay-json-patch';

export function elementBridge<ElementViewState, ElementRef>(viewState: ElementViewState, refManager: SecureReferencesManager,
    sandboxElements: () => SandboxElement<ElementViewState>[],
    arraySerializationContext: ArrayContexts = [],
): JayElement<ElementViewState, ElementRef> {
    const parentComponentContext = useContext(SANDBOX_BRIDGE_CONTEXT);
    const { reactive, getComponentInstance } = useContext(COMPONENT_CONTEXT);
    const thisComponentEndpoint = parentComponentContext.port.getEndpoint(
        parentComponentContext.compId,
        parentComponentContext.coordinate,
    );
    return mkBridgeElement(
        viewState,
        sandboxElements,
        thisComponentEndpoint,
        reactive as unknown as Reactive,
        refManager,
        getComponentInstance,
        arraySerializationContext,
    ) as unknown as JayElement<ElementViewState, ElementRef>;
}
