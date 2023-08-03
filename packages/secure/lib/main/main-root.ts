import {BaseJayElement, provideContext} from "jay-runtime";
import {useMainPort} from "../comm-channel/comm-channel";
import {SECURE_COMPONENT_MARKER} from "./main-contexts";
import {JayPortMessageType, nativeExecResult, rootComponentViewState} from "../comm-channel/messages";
import {serialize} from 'jay-serialization'
import {FunctionsRepository, JayGlobalNativeFunction} from "./function-repository-types";
import {JSONPatch} from "../../../json-patch";


export function mainRoot<ViewState>(viewState: ViewState,
                                    elementConstructor: () => BaseJayElement<ViewState>,
                                    funcRepository?: FunctionsRepository): BaseJayElement<ViewState> {
    let port = useMainPort();
    let endpoint = port.getRootEndpoint();
    let context = {compId: endpoint.compId, endpoint, port, funcRepository}

    endpoint.onUpdate(async message => {
        switch (message.type) {
            case JayPortMessageType.nativeExec: {
                let {nativeId, correlationId} = message;
                    try {
                        let result = await (funcRepository[nativeId] as JayGlobalNativeFunction<any>)();
                        port.batch(async () => {
                            endpoint.post(nativeExecResult(correlationId, result, undefined))
                        })
                    }
                    catch (err) {
                        port.batch(async () => {
                            endpoint.post(nativeExecResult(correlationId, undefined, err.message))
                        })
                    }
                break;
            }
        }
    })

    return provideContext(SECURE_COMPONENT_MARKER, context, () => {
        let patch: JSONPatch, nextSerialize;
        let element = port.batch(() => {
            [patch, nextSerialize] = serialize(viewState);
            endpoint.post(rootComponentViewState(patch))
            return elementConstructor();
        })
        return {
            dom: element.dom,
            mount: element.mount,
            unmount: element.unmount,
            update: (newData: ViewState) => {
                element.update(newData);
                port.batch(() => {
                    [patch, nextSerialize] = nextSerialize(newData);
                    endpoint.post(rootComponentViewState(patch))
                })
            }
        }
    })

}