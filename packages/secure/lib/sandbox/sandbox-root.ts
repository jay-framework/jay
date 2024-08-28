import { withContext } from 'jay-runtime';
import { IJayPort, useWorkerPort } from '../comm-channel/comm-channel';
import { SANDBOX_CREATION_CONTEXT, SandboxCreationContext } from './sandbox-context';
import { SandboxElement } from './sandbox-element';
import {
    JayPortMessageType,
    JPMNativeExecResult,
    JPMRootComponentViewState,
} from '../comm-channel/messages';
import { deserialize, Deserialize } from 'jay-serialization';
import { completeCorrelatedPromise } from '../$func';

export function sandboxRoot<ViewState extends object>(
    sandboxElements: () => Array<SandboxElement<ViewState>>,
) {
    let port: IJayPort = useWorkerPort();
    let endpoint = port.getRootEndpoint();
    let elements: Array<SandboxElement<ViewState>>;
    let viewState: ViewState,
        nextDeserialize: Deserialize<ViewState> = deserialize;
    endpoint.onUpdate((inMessage: JPMRootComponentViewState | JPMNativeExecResult) => {
        switch (inMessage.type) {
            case JayPortMessageType.root: {
                [viewState, nextDeserialize] = nextDeserialize(inMessage.patch);
                if (!elements) {
                    let context: SandboxCreationContext<ViewState> = {
                        viewState,
                        endpoint,
                        isDynamic: false,
                        dataIds: [],
                    };
                    elements = withContext(SANDBOX_CREATION_CONTEXT, context, () => {
                        return sandboxElements();
                    });
                } else {
                    [viewState, nextDeserialize] = nextDeserialize(inMessage.patch);
                    elements.forEach((element) => element.update(viewState));
                }
                break;
            }
            case JayPortMessageType.nativeExecResult: {
                completeCorrelatedPromise(inMessage);
                break;
            }
        }
    });
}
