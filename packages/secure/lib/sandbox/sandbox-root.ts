import {provideContext} from "jay-runtime";
import {IJayPort, useWorkerPort} from "../comm-channel/comm-channel";
import {SANDBOX_CREATION_CONTEXT, SandboxCreationContext} from "./sandbox-context";
import {SandboxElement} from "./sandbox-element";
import {JPMRootComponentViewState} from "../comm-channel/messages";
import {deserialize, Deserialize} from "jay-reactive";

export function sandboxRoot<ViewState extends object>(sandboxElements: () => Array<SandboxElement<ViewState>>) {
    let port: IJayPort = useWorkerPort();
    let endpoint = port.getRootEndpoint();
    let elements: Array<SandboxElement<ViewState>>;
    let viewState: ViewState, nextDeserialize: Deserialize<ViewState> = deserialize;

    endpoint.onUpdate((inMessage: JPMRootComponentViewState)  => {
        [viewState, nextDeserialize] = deserialize<ViewState>(inMessage.viewState)
        if (!elements) {
            let context: SandboxCreationContext<ViewState> = {viewState, endpoint, isDynamic: false, dataIds: []}
            elements = provideContext(SANDBOX_CREATION_CONTEXT, context, () => {
                return sandboxElements();
            })
        }
        else {
            [viewState, nextDeserialize] = nextDeserialize(inMessage.viewState)
            elements.forEach(element => element.update(viewState))
        }
    })
}