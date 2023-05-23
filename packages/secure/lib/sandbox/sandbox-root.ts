import {provideContext} from "jay-runtime";
import {JayPort, JPMRootComponentViewState, useWorkerPort} from "../comm-channel/comm-channel";
import {SANDBOX_CREATION_CONTEXT, SandboxCreationContext} from "./sandbox-context";
import {SandboxElement} from "./sandbox-element";

export function sandboxRoot<ViewState>(sandboxElements: () => Array<SandboxElement<ViewState>>) {
    let port: JayPort = useWorkerPort();
    let endpoint = port.getRootEndpoint();
    let elements: Array<SandboxElement<ViewState>>;
    endpoint.onUpdate((inMessage: JPMRootComponentViewState)  => {
        let viewState = inMessage.viewState as unknown as ViewState;
        if (!elements) {
            let context: SandboxCreationContext<ViewState> = {viewState, endpoint, isDynamic: false, dataIds: []}
            elements = provideContext(SANDBOX_CREATION_CONTEXT, context, () => {
                return sandboxElements();
            })
        }
        else {
            elements.forEach(element => element.update(viewState))
        }
    })
}