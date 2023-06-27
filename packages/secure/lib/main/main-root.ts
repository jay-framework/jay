import {BaseJayElement, provideContext} from "jay-runtime";
import {useMainPort} from "../comm-channel/comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";
import {JayPortMessageType, nativeExecResult, rootComponentViewState} from "../comm-channel/messages";
import {serialize} from 'jay-reactive'
import {FunctionsRepository, JayGlobalNativeFunction} from "./function-repository-types";


export function mainRoot<ViewState>(viewState: ViewState,
                                    elementConstructor: () => BaseJayElement<ViewState>,
                                    funcRepository?: FunctionsRepository): BaseJayElement<ViewState> {
    let port = useMainPort();
    let endpoint = port.getRootEndpoint();
    let context = {compId: endpoint.compId, endpoint, port}

    endpoint.onUpdate(message => {
        switch (message.type) {
            case JayPortMessageType.nativeExec: {
                let {nativeId, correlationId} = message;
                port.batch(async () => {
                    try {
                        let result = await (funcRepository[nativeId] as JayGlobalNativeFunction<any>)();
                        endpoint.post(nativeExecResult(correlationId, result, undefined))
                    }
                    catch (err) {
                        endpoint.post(nativeExecResult(correlationId, undefined, err.message))
                    }
                });
                break;
            }
        }
    })

    return provideContext(SECURE_COMPONENT_MARKER, context, () => {
        let serialized: string, nextSerialize;
        let element = port.batch(() => {
            [serialized, nextSerialize] = serialize(viewState);
            endpoint.post(rootComponentViewState(serialized))
            return elementConstructor();
        })
        return {
            dom: element.dom,
            mount: element.mount,
            unmount: element.unmount,
            update: (newData: ViewState) => {
                element.update(newData);
                port.batch(() => {
                    [serialized, nextSerialize] = nextSerialize(newData);
                    endpoint.post(rootComponentViewState(serialized))
                })
            }
        }
    })

}